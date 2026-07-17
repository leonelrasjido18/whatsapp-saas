import { NextResponse } from "next/server";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { sendTemplate } from "@/features/inbox/services/ycloud-client";
import {
  computeRoiReport,
  formatMonthlyReportMessage,
  lastNDaysWindows,
  type TopProduct,
} from "@/features/dashboard/services/roi-report";
import { buildMonthlyReportPdf } from "@/features/dashboard/services/monthly-pdf";
import { getPlatformBranding } from "@/features/agency/services/branding";

// #5 Monthly report to the business owner — same delivery mechanism as the
// weekly one (approved template, outside the 24h window), but a 30-day window
// with top products. Reuses the weekly_report_* config; a workspace can override
// the template with monthly_report_template if it wants a distinct one. Runs on
// the 1st of each month.
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const supabase = createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  try {
    const { data: integrations } = await supabase
      .from("integrations")
      .select("workspace_id, credentials, config")
      .eq("provider", "ycloud")
      .eq("enabled", true);

    interface ReportTarget {
      workspaceId: string;
      apiKey: string;
      fromPhone: string;
      toPhone: string;
      templateName: string;
      language: string;
    }

    const targets: ReportTarget[] = [];
    for (const it of integrations ?? []) {
      const config = (it.config as Record<string, unknown> | null) ?? {};
      const credentials =
        (it.credentials as Record<string, unknown> | null) ?? {};
      const toPhone = config.weekly_report_phone;
      // Prefer a dedicated monthly template; fall back to the weekly one.
      const templateName =
        config.monthly_report_template ?? config.weekly_report_template;
      const apiKey = credentials.ycloud_api_key;
      const fromPhone = config.phone_number;

      if (
        typeof toPhone === "string" &&
        toPhone.length > 0 &&
        typeof templateName === "string" &&
        templateName.length > 0 &&
        typeof apiKey === "string" &&
        apiKey.length > 0 &&
        apiKey !== "placeholder" &&
        typeof fromPhone === "string" &&
        fromPhone.length > 0
      ) {
        targets.push({
          workspaceId: it.workspace_id as string,
          apiKey,
          fromPhone,
          toPhone,
          templateName,
          language:
            typeof config.weekly_report_language === "string"
              ? config.weekly_report_language
              : "es",
        });
      }
    }

    if (targets.length === 0) {
      return NextResponse.json({
        ok: true,
        sent: 0,
        note: "No hay workspaces con reporte configurado (config.weekly_report_phone + weekly_report_template).",
      });
    }

    const wsIds = targets.map((t) => t.workspaceId);
    const { data: workspaces } = await supabase
      .from("workspaces")
      .select("id, name")
      .in("id", wsIds);
    const nameById = new Map<string, string>();
    for (const w of workspaces ?? []) {
      nameById.set(w.id as string, (w.name as string) ?? "tu negocio");
    }

    const { current } = lastNDaysWindows(30);
    const branding = await getPlatformBranding();
    let sent = 0;
    let skipped = 0;

    for (const t of targets) {
      const report = await computeRoiReport(
        t.workspaceId,
        current.from,
        current.to,
      );

      // Top products from the commerce analytics RPC (best-effort).
      let topProducts: TopProduct[] = [];
      try {
        const { data: metrics } = await supabase.rpc("get_sales_metrics", {
          p_workspace_id: t.workspaceId,
        });
        const tp = (metrics as { top_products?: unknown } | null)?.top_products;
        if (Array.isArray(tp)) {
          topProducts = tp as TopProduct[];
        }
      } catch {
        // Non-commerce workspace or RPC missing — omit the section.
      }

      let summary = formatMonthlyReportMessage(
        nameById.get(t.workspaceId) ?? "tu negocio",
        report,
        topProducts,
      );

      // Generate a branded PDF, upload it, and append the link (best-effort —
      // never blocks sending the text summary if PDF generation/upload fails).
      try {
        const { data: npsRows } = await supabase
          .from("nps_responses")
          .select("score")
          .eq("workspace_id", t.workspaceId)
          .not("score", "is", null)
          .gte("requested_at", current.from);
        const scores = (npsRows ?? [])
          .map((r) => Number(r.score))
          .filter((n) => Number.isFinite(n));
        const npsAvg =
          scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;

        const pdf = buildMonthlyReportPdf({
          businessName: nameById.get(t.workspaceId) ?? "tu negocio",
          branding,
          report,
          topProducts,
          npsAvg,
        });

        const monthKey = new Date().toISOString().slice(0, 7);
        const path = `${t.workspaceId}/reports/monthly-${monthKey}.pdf`;
        await supabase.storage
          .from("whatsapp-media")
          .upload(path, pdf, { contentType: "application/pdf", upsert: true });
        const { data: signed } = await supabase.storage
          .from("whatsapp-media")
          .createSignedUrl(path, 30 * 24 * 3600);
        if (signed?.signedUrl) {
          summary += `\n\nPDF: ${signed.signedUrl}`;
        }
      } catch (pdfErr) {
        console.error(
          `[Cron monthly-report] PDF generation failed for ${t.workspaceId}:`,
          pdfErr,
        );
      }

      const result = await sendTemplate({
        apiKey: t.apiKey,
        from: t.fromPhone,
        to: t.toPhone,
        templateName: t.templateName,
        language: t.language,
        components: [
          { type: "body", parameters: [{ type: "text", text: summary }] },
        ],
      }).catch((e) => {
        console.error(
          `[Cron monthly-report] send failed for ${t.workspaceId}:`,
          e,
        );
        return null;
      });

      if (result) sent++;
      else skipped++;
    }

    return NextResponse.json({ ok: true, sent, skipped });
  } catch (err) {
    console.error("[Cron monthly-report] exception:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "error" },
      { status: 500 },
    );
  }
}
