import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/features/workspace/services/active-workspace";
import { getPlan } from "@/features/billing/plans";
import { showsCommerce } from "@/features/workspace/lib/business-type";
import VentasShell from "./ventas-shell";

export const dynamic = "force-dynamic";

export default async function VentasPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const active = await getActiveWorkspace(supabase, user.id);
  if (!active) redirect("/dashboard");

  // El módulo de ventas solo aplica a comercios (o general).
  if (!showsCommerce(active.business_type)) redirect("/dashboard");

  // Verificar plan
  const { data: wsRow } = await supabase
    .from("workspaces")
    .select("plan_tier")
    .eq("id", active.workspace_id)
    .single();

  const planTier = wsRow?.plan_tier || "starter";
  const plan = getPlan(planTier as any);

  return (
    <div className="flex-1 overflow-hidden">
      <VentasShell 
        workspaceId={active.workspace_id} 
        role={active.role} 
        plan={plan}
      />
    </div>
  );
}
