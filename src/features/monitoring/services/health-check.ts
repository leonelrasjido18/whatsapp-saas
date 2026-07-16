// health-check.ts — #6 Uptime / monitoring. Sweeps every active workspace and
// verifies the pieces the agent depends on to answer customers:
//   • YCloud WhatsApp: API key valid + account balance not depleted.
//   • Meta (FB/IG): token not flagged for reconnection.
//   • "Bot silent": inbound messages arrived recently but the AI produced no
//     replies — a strong signal the pipeline is broken for that workspace.
// Findings become platform-level alerts (super admin) and, for the ones the
// client can act on, workspace-level alerts too. Healthy checks auto-resolve
// their previously-open alert so the panel self-cleans.

import { createClient as createSbClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { raiseAlert, resolveAlertByKey } from "./alerts";

function svc(): SupabaseClient {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/** Below this YCloud balance we warn the super admin to top up. */
const YCLOUD_LOW_BALANCE = 5;
/** Bot-silent window and threshold. */
const SILENT_WINDOW_MS = 3 * 60 * 60 * 1000; // 3h
const SILENT_MIN_INBOUND = 3;

export interface HealthCheckSummary {
  workspacesChecked: number;
  alertsRaised: number;
  alertsResolved: number;
}

async function checkYCloud(
  supabase: SupabaseClient,
  workspaceId: string,
  workspaceName: string,
  credentials: Record<string, unknown>,
  counters: { raised: number; resolved: number },
): Promise<void> {
  const apiKey = credentials.ycloud_api_key as string | undefined;
  const downKey = `integration_down:ycloud:${workspaceId}`;
  const balanceKey = `ycloud_balance_low:${workspaceId}`;

  if (!apiKey || apiKey === "placeholder") {
    // No real key configured — not an outage, skip silently.
    return;
  }

  try {
    const res = await fetch("https://api.ycloud.com/v2/balance", {
      headers: { "X-API-Key": apiKey },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      await raiseAlert(
        {
          workspaceId: null,
          kind: "integration_down",
          severity: "critical",
          title: `WhatsApp caído — ${workspaceName}`,
          body: `La API de YCloud rechazó la key (HTTP ${res.status}). El agente no puede enviar ni recibir WhatsApp.`,
          meta: { workspaceId, provider: "ycloud", status: res.status },
          dedupKey: downKey,
        },
        supabase,
      );
      counters.raised++;
      return;
    }

    const balance = (await res.json()) as { balance?: number; currency?: string };
    await resolveAlertByKey(downKey, supabase);

    if (typeof balance.balance === "number" && balance.balance < YCLOUD_LOW_BALANCE) {
      await raiseAlert(
        {
          workspaceId: null,
          kind: "ycloud_balance_low",
          severity: "warning",
          title: `Saldo YCloud bajo — ${workspaceName}`,
          body: `Saldo actual: ${balance.balance} ${balance.currency ?? ""}. Recargá para no cortar los envíos.`,
          meta: { workspaceId, balance: balance.balance, currency: balance.currency },
          dedupKey: balanceKey,
        },
        supabase,
      );
      counters.raised++;
    } else {
      await resolveAlertByKey(balanceKey, supabase);
    }
  } catch (err) {
    await raiseAlert(
      {
        workspaceId: null,
        kind: "integration_down",
        severity: "critical",
        title: `WhatsApp inaccesible — ${workspaceName}`,
        body: `No se pudo contactar a YCloud: ${err instanceof Error ? err.message : "error de red"}.`,
        meta: { workspaceId, provider: "ycloud" },
        dedupKey: downKey,
      },
      supabase,
    );
    counters.raised++;
  }
}

async function checkMeta(
  supabase: SupabaseClient,
  workspaceId: string,
  workspaceName: string,
  config: Record<string, unknown>,
  counters: { raised: number; resolved: number },
): Promise<void> {
  const key = `integration_down:meta:${workspaceId}`;
  if (config.reconnect_required === true) {
    await raiseAlert(
      {
        workspaceId,
        kind: "integration_down",
        severity: "critical",
        title: "Reconectá Facebook/Instagram",
        body: "El token de Meta venció o fue revocado. El agente no puede responder en Messenger/Instagram hasta reconectar la cuenta.",
        meta: { provider: "meta" },
        dedupKey: key,
      },
      supabase,
    );
    counters.raised++;
  } else {
    await resolveAlertByKey(key, supabase);
  }
}

async function checkBotSilent(
  supabase: SupabaseClient,
  workspaceId: string,
  workspaceName: string,
  counters: { raised: number; resolved: number },
): Promise<void> {
  const since = new Date(Date.now() - SILENT_WINDOW_MS).toISOString();
  const key = `bot_silent:${workspaceId}`;

  const [{ count: inbound }, { count: aiOut }] = await Promise.all([
    supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("direction", "in")
      .gte("created_at", since),
    supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("direction", "out")
      .is("sender_user_id", null) // AI-generated (no human agent)
      .gte("created_at", since),
  ]);

  // Enough inbound traffic but zero AI replies → the agent is likely stuck.
  if ((inbound ?? 0) >= SILENT_MIN_INBOUND && (aiOut ?? 0) === 0) {
    await raiseAlert(
      {
        workspaceId: null,
        kind: "bot_silent",
        severity: "critical",
        title: `El bot no está respondiendo — ${workspaceName}`,
        body: `Llegaron ${inbound} mensajes en las últimas 3h y la IA no respondió ninguno. Revisá la integración o el saldo de IA.`,
        meta: { workspaceId, inbound, aiOut },
        dedupKey: key,
      },
      supabase,
    );
    counters.raised++;
  } else {
    await resolveAlertByKey(key, supabase);
  }
}

/**
 * Runs the full sweep. Safe to call every ~10 minutes from the cron.
 */
export async function runHealthCheck(): Promise<HealthCheckSummary> {
  const supabase = svc();
  const counters = { raised: 0, resolved: 0 };

  // Active workspaces with their names.
  const { data: workspaces } = await supabase
    .from("workspaces")
    .select("id, name");
  const nameById = new Map<string, string>();
  for (const w of workspaces ?? []) {
    nameById.set(w.id as string, (w.name as string) ?? "negocio");
  }

  // All integrations we care about, in two queries.
  const { data: integrations } = await supabase
    .from("integrations")
    .select("workspace_id, provider, credentials, config, enabled")
    .in("provider", ["ycloud", "meta"]);

  const ycloudByWs = new Map<string, Record<string, unknown>>();
  const metaConfigByWs = new Map<string, Record<string, unknown>>();
  for (const it of integrations ?? []) {
    const wsId = it.workspace_id as string;
    if (it.provider === "ycloud" && it.enabled) {
      ycloudByWs.set(wsId, (it.credentials as Record<string, unknown>) ?? {});
    } else if (it.provider === "meta") {
      metaConfigByWs.set(wsId, (it.config as Record<string, unknown>) ?? {});
    }
  }

  for (const [wsId, name] of nameById) {
    const ycloudCreds = ycloudByWs.get(wsId);
    if (ycloudCreds) {
      await checkYCloud(supabase, wsId, name, ycloudCreds, counters);
      // Only meaningful to check bot silence for workspaces that actually run WhatsApp.
      await checkBotSilent(supabase, wsId, name, counters);
    }
    const metaConfig = metaConfigByWs.get(wsId);
    if (metaConfig) {
      await checkMeta(supabase, wsId, name, metaConfig, counters);
    }
  }

  return {
    workspacesChecked: nameById.size,
    alertsRaised: counters.raised,
    alertsResolved: counters.resolved,
  };
}
