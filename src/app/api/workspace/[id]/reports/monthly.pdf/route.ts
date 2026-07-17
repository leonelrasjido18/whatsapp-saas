// On-demand monthly report PDF (dashboard "Descargar PDF" button). Manager+.

import { NextRequest, NextResponse } from "next/server";
import { createClient as createSvcClient } from "@supabase/supabase-js";
import { requireWorkspaceMember } from "@/lib/auth/workspace-access";
import {
  computeRoiReport,
  lastNDaysWindows,
  type TopProduct,
} from "@/features/dashboard/services/roi-report";
import { buildMonthlyReportPdf } from "@/features/dashboard/services/monthly-pdf";
import { getPlatformBranding } from "@/features/agency/services/branding";

function svc() {
  return createSvcClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;
  const auth = await requireWorkspaceMember(workspaceId, { minRole: "manager" });
  if (!auth.ok) return auth.response;

  const supabase = svc();
  const [{ data: workspace }, branding] = await Promise.all([
    supabase.from("workspaces").select("name").eq("id", workspaceId).maybeSingle(),
    getPlatformBranding(),
  ]);

  const { current } = lastNDaysWindows(30);
  const report = await computeRoiReport(workspaceId, current.from, current.to);

  let topProducts: TopProduct[] = [];
  try {
    const { data: metrics } = await supabase.rpc("get_sales_metrics", {
      p_workspace_id: workspaceId,
    });
    const tp = (metrics as { top_products?: unknown } | null)?.top_products;
    if (Array.isArray(tp)) topProducts = tp as TopProduct[];
  } catch {
    /* non-commerce workspace */
  }

  const { data: npsRows } = await supabase
    .from("nps_responses")
    .select("score")
    .eq("workspace_id", workspaceId)
    .not("score", "is", null)
    .gte("requested_at", current.from);
  const scores = (npsRows ?? [])
    .map((r) => Number(r.score))
    .filter((n) => Number.isFinite(n));
  const npsAvg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;

  const pdf = buildMonthlyReportPdf({
    businessName: (workspace?.name as string) ?? "Tu negocio",
    branding,
    report,
    topProducts,
    npsAvg,
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="reporte-mensual.pdf"',
      "Cache-Control": "no-store",
    },
  });
}
