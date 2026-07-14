import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/features/workspace/services/active-workspace";
import { getPlan, type PlanTier } from "@/features/billing/plans";
import CampaignsShell from "./campaigns-shell";

export const dynamic = "force-dynamic";

export default async function CampanasPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const active = await getActiveWorkspace(supabase, user.id);
  if (!active) redirect("/dashboard");

  const { data: wsRow } = await supabase
    .from("workspaces")
    .select("plan_tier")
    .eq("id", active.workspace_id)
    .single();

  const tier = (wsRow?.plan_tier as PlanTier) ?? "starter";
  const plan = getPlan(tier);

  return (
    <div className="flex-1 overflow-y-auto">
      <CampaignsShell
        workspaceId={active.workspace_id}
        role={active.role}
        campaignsEnabled={plan.features.campaigns}
        monthlyLimit={plan.campaign_monthly_limit}
      />
    </div>
  );
}
