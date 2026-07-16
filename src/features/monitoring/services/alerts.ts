// Alerts service — a thin API over the system_alerts table used by the
// monitoring crons (#6 uptime) and the business alert crons (#5 low-stock /
// response-rate). Everything runs with the service role; callers (crons) are
// already authorized via the CRON_SECRET.

import { createClient as createSbClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AlertSeverity = "info" | "warning" | "critical";

export interface RaiseAlertInput {
  /** NULL = platform-level (super admin). Set = a specific workspace. */
  workspaceId: string | null;
  kind: string;
  severity?: AlertSeverity;
  title: string;
  body?: string;
  meta?: Record<string, unknown>;
  /**
   * Stable identity of the problem. Defaults to `${kind}:${workspaceId}`.
   * A second raise with the same key while one is still open is a no-op update
   * (thanks to the partial unique index), so a 10-min cron never spams rows.
   */
  dedupKey?: string;
}

export interface SystemAlert {
  id: string;
  workspace_id: string | null;
  kind: string;
  severity: AlertSeverity;
  title: string;
  body: string | null;
  meta: Record<string, unknown>;
  dedup_key: string;
  resolved_at: string | null;
  created_at: string;
}

function svc(): SupabaseClient {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * Raises an alert if one with the same dedup_key isn't already open. If an open
 * alert exists, it refreshes its body/meta/updated_at (so the panel shows the
 * latest state) instead of creating a duplicate. Returns the alert id, or null
 * when the raise was a no-op (already open and unchanged path still returns id).
 */
export async function raiseAlert(
  input: RaiseAlertInput,
  client?: SupabaseClient,
): Promise<string | null> {
  const supabase = client ?? svc();
  const dedupKey =
    input.dedupKey ?? `${input.kind}:${input.workspaceId ?? "platform"}`;

  // Is there already an open alert with this key? Update it instead of inserting
  // (the partial unique index would otherwise reject the insert).
  const { data: existing } = await supabase
    .from("system_alerts")
    .select("id")
    .eq("dedup_key", dedupKey)
    .is("resolved_at", null)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("system_alerts")
      .update({
        severity: input.severity ?? "warning",
        title: input.title,
        body: input.body ?? null,
        meta: input.meta ?? {},
      })
      .eq("id", existing.id as string);
    return existing.id as string;
  }

  const { data, error } = await supabase
    .from("system_alerts")
    .insert({
      workspace_id: input.workspaceId,
      kind: input.kind,
      severity: input.severity ?? "warning",
      title: input.title,
      body: input.body ?? null,
      meta: input.meta ?? {},
      dedup_key: dedupKey,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[alerts] raise error:", error.message);
    return null;
  }
  return (data?.id as string) ?? null;
}

/**
 * Resolves (closes) an open alert by dedup_key. Called when a health-check
 * recovers, so the panel auto-clears without manual intervention. No-op when
 * nothing is open for that key.
 */
export async function resolveAlertByKey(
  dedupKey: string,
  client?: SupabaseClient,
): Promise<void> {
  const supabase = client ?? svc();
  await supabase
    .from("system_alerts")
    .update({ resolved_at: new Date().toISOString() })
    .eq("dedup_key", dedupKey)
    .is("resolved_at", null);
}

/** Lists open platform-level alerts (super admin dashboard). */
export async function listPlatformAlerts(
  client?: SupabaseClient,
): Promise<SystemAlert[]> {
  const supabase = client ?? svc();
  const { data } = await supabase
    .from("system_alerts")
    .select("*")
    .is("workspace_id", null)
    .is("resolved_at", null)
    .order("created_at", { ascending: false })
    .limit(200);
  return (data as SystemAlert[]) ?? [];
}

/** Lists open alerts for a single workspace (owner-facing). */
export async function listWorkspaceAlerts(
  workspaceId: string,
  client?: SupabaseClient,
): Promise<SystemAlert[]> {
  const supabase = client ?? svc();
  const { data } = await supabase
    .from("system_alerts")
    .select("*")
    .eq("workspace_id", workspaceId)
    .is("resolved_at", null)
    .order("created_at", { ascending: false })
    .limit(100);
  return (data as SystemAlert[]) ?? [];
}
