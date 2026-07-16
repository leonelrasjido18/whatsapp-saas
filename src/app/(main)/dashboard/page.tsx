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
import { InsightsSection } from "@/features/dashboard/components/insights-section";

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

  // NPS: average of collected scores (0-10) in the last 90 days.
  const { data: npsRows } = await supabase
    .from("nps_responses")
    .select("score")
    .eq("workspace_id", membership.workspace_id)
    .not("score", "is", null)
    .gte("requested_at", new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString());
  const npsScores = (npsRows ?? [])
    .map((r) => Number(r.score))
    .filter((n) => Number.isFinite(n));
  const npsAvg =
    npsScores.length > 0
      ? (npsScores.reduce((a, b) => a + b, 0) / npsScores.length).toFixed(1)
      : null;

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
      {npsAvg !== null && (
        <div className="rounded-xl border border-border bg-card p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              Satisfacción (NPS)
            </p>
            <p className="text-xs text-muted-foreground/70">
              Promedio de {npsScores.length} respuesta(s), últimos 90 días
            </p>
          </div>
          <p className="font-mono text-3xl font-bold text-foreground">
            {npsAvg}
            <span className="text-base text-muted-foreground">/10</span>
          </p>
        </div>
      )}
      <RoiSection current={roiCurrent} previous={roiPrevious} />
      <InsightsSection workspaceId={membership.workspace_id} />
      <DashboardMetrics
        metrics={metrics}
        recentConversations={recentConversations}
      />
    </div>
  );
}
