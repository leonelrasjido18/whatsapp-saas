import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/features/workspace/services/active-workspace";
import {
  getWorkspaceMetrics,
  getRecentConversations,
} from "@/features/dashboard/services/metrics";
import {
  computeRoiReport,
  lastNDaysWindows,
} from "@/features/dashboard/services/roi-report";
import { DashboardMetrics } from "@/features/dashboard/components/dashboard-metrics";
import { RoiSection } from "@/features/dashboard/components/roi-section";
import { getWorkspaceAlerts } from "@/features/monitoring/services/monitoring-actions";
import { WorkspaceAlertsBanner } from "@/features/monitoring/components/workspace-alerts-banner";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const membership = await getActiveWorkspace(supabase, user.id);

  if (!membership) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground text-sm">
          No tienes un workspace activo.
        </p>
      </div>
    );
  }

  const windows = lastNDaysWindows(7);

  const [metrics, recentConversations, roiCurrent, roiPrevious, alerts] =
    await Promise.all([
      getWorkspaceMetrics(membership.workspace_id),
      getRecentConversations(membership.workspace_id, 5),
      computeRoiReport(
        membership.workspace_id,
        windows.current.from,
        windows.current.to,
      ),
      computeRoiReport(
        membership.workspace_id,
        windows.previous.from,
        windows.previous.to,
      ),
      getWorkspaceAlerts(membership.workspace_id),
    ]);

  return (
    <div className="p-6 space-y-8 max-w-5xl mx-auto">
      <div>
        <h1 className="font-display text-xl font-semibold text-foreground">
          Dashboard
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Resumen de resultados y actividad del workspace
        </p>
      </div>
      <WorkspaceAlertsBanner initialAlerts={alerts} />
      <RoiSection current={roiCurrent} previous={roiPrevious} />
      <DashboardMetrics
        metrics={metrics}
        recentConversations={recentConversations}
      />
    </div>
  );
}
