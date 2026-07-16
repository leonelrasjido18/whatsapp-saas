// business-alerts.ts — #5 owner-facing operational alerts. Unlike health-check
// (platform/super-admin), these are workspace-level so the business owner sees
// them in their dashboard: products about to run out and conversations piling up
// waiting for a human. Each check auto-resolves when the condition clears.

import { createClient as createSbClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { raiseAlert, resolveAlertByKey } from "./alerts";

function svc(): SupabaseClient {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/** Conversations stuck waiting for a human longer than this count as a backlog. */
const HANDOFF_BACKLOG_MIN = 3;

export interface BusinessAlertsSummary {
  workspacesChecked: number;
  alertsRaised: number;
}

async function checkLowStock(
  supabase: SupabaseClient,
  workspaceId: string,
  counter: { raised: number },
): Promise<void> {
  const key = `low_stock:${workspaceId}`;

  // Managed-stock products at or below their threshold.
  const { data: products } = await supabase
    .from("products")
    .select("name, stock_qty, low_stock_threshold")
    .eq("workspace_id", workspaceId)
    .eq("is_active", true)
    .eq("type", "product")
    .not("stock_qty", "is", null);

  const low = (products ?? []).filter(
    (p) =>
      typeof p.stock_qty === "number" &&
      p.stock_qty <= ((p.low_stock_threshold as number | null) ?? 5),
  );

  if (low.length === 0) {
    await resolveAlertByKey(key, supabase);
    return;
  }

  const names = low
    .slice(0, 5)
    .map((p) => `${p.name} (${p.stock_qty})`)
    .join(", ");
  const extra = low.length > 5 ? ` y ${low.length - 5} más` : "";

  await raiseAlert(
    {
      workspaceId,
      kind: "low_stock",
      severity: "warning",
      title: `${low.length} producto${low.length > 1 ? "s" : ""} con stock bajo`,
      body: `Reponé pronto: ${names}${extra}.`,
      meta: {
        count: low.length,
        products: low.map((p) => ({ name: p.name, stock: p.stock_qty })),
      },
      dedupKey: key,
    },
    supabase,
  );
  counter.raised++;
}

async function checkHandoffBacklog(
  supabase: SupabaseClient,
  workspaceId: string,
  counter: { raised: number },
): Promise<void> {
  const key = `handoff_backlog:${workspaceId}`;
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // pending >1h

  const { count } = await supabase
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("state", "handoff_pending")
    .lte("last_message_at", since);

  if ((count ?? 0) >= HANDOFF_BACKLOG_MIN) {
    await raiseAlert(
      {
        workspaceId,
        kind: "handoff_backlog",
        severity: "warning",
        title: `${count} conversaciones esperando atención`,
        body: `Hay clientes que pidieron hablar con una persona y siguen sin respuesta hace más de una hora.`,
        meta: { count },
        dedupKey: key,
      },
      supabase,
    );
    counter.raised++;
  } else {
    await resolveAlertByKey(key, supabase);
  }
}

export async function runBusinessAlerts(): Promise<BusinessAlertsSummary> {
  const supabase = svc();
  const counter = { raised: 0 };

  const { data: workspaces } = await supabase
    .from("workspaces")
    .select("id, business_type");

  let checked = 0;
  for (const w of workspaces ?? []) {
    const wsId = w.id as string;
    checked++;
    // Low stock only matters for commerce-ish workspaces; harmless elsewhere
    // (no managed-stock products → resolves to nothing).
    await checkLowStock(supabase, wsId, counter);
    await checkHandoffBacklog(supabase, wsId, counter);
  }

  return { workspacesChecked: checked, alertsRaised: counter.raised };
}
