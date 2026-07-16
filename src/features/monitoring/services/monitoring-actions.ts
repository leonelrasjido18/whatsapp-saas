"use server";

import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { listPlatformAlerts, type SystemAlert } from "./alerts";

function svc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function assertSuperAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase
    .from("users")
    .select("is_super_admin")
    .eq("id", user.id)
    .single();
  return Boolean(data?.is_super_admin);
}

/** Super-admin: open platform-level alerts for the monitoring panel. */
export async function getPlatformAlerts(): Promise<SystemAlert[]> {
  if (!(await assertSuperAdmin())) return [];
  return listPlatformAlerts(svc());
}

/** Super-admin: manually resolve/dismiss an alert. */
export async function resolvePlatformAlert(
  alertId: string,
): Promise<{ ok?: boolean; error?: string }> {
  if (!(await assertSuperAdmin())) return { error: "No autorizado" };
  const { error } = await svc()
    .from("system_alerts")
    .update({ resolved_at: new Date().toISOString() })
    .eq("id", alertId);
  if (error) return { error: "No se pudo resolver la alerta" };
  return { ok: true };
}

/** Open alerts for a workspace (owner dashboard). RLS confirms membership. */
export async function getWorkspaceAlerts(
  workspaceId: string,
): Promise<SystemAlert[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  // Read through the user's RLS-scoped client — non-members get nothing.
  const { data } = await supabase
    .from("system_alerts")
    .select("*")
    .eq("workspace_id", workspaceId)
    .is("resolved_at", null)
    .order("created_at", { ascending: false })
    .limit(50);
  return (data as SystemAlert[]) ?? [];
}

/**
 * Resolves a workspace alert. The user's RLS UPDATE policy already restricts
 * this to admins/managers of that workspace, so a plain scoped update is safe.
 */
export async function resolveWorkspaceAlert(
  alertId: string,
): Promise<{ ok?: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autorizado" };
  const { error } = await supabase
    .from("system_alerts")
    .update({ resolved_at: new Date().toISOString() })
    .eq("id", alertId);
  if (error) return { error: "No se pudo resolver la alerta" };
  return { ok: true };
}
