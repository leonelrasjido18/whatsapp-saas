import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/features/workspace/services/active-workspace";
import { showsBookings } from "@/features/workspace/lib/business-type";
import TurnosShell from "./turnos-shell";

export const dynamic = "force-dynamic";

export default async function TurnosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const active = await getActiveWorkspace(supabase, user.id);
  if (!active) redirect("/dashboard");

  // El módulo de turnos solo aplica a servicios (o general).
  if (!showsBookings(active.business_type)) redirect("/dashboard");

  return (
    <div className="flex-1 overflow-y-auto">
      <TurnosShell workspaceId={active.workspace_id} role={active.role} />
    </div>
  );
}
