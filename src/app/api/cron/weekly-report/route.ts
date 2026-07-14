import { NextResponse } from "next/server";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { sendTemplate } from "@/features/inbox/services/ycloud-client";
import {
  computeRoiReport,
  formatWeeklyReportMessage,
  lastNDaysWindows,
} from "@/features/dashboard/services/roi-report";

// Weekly ROI summary to the business owner ("tu IA cerró $X esta semana").
// Runs Mondays. Because this is a proactive message OUTSIDE the 24h window, real
// WhatsApp delivery needs an approved template — so, like the reengagement cron,
// it only sends for workspaces that configured both a report phone and template
// on their YCloud integration (config.weekly_report_phone + weekly_report_template).
// The template must have a single body parameter {{1}} that receives the summary.
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
      const templateName = config.weekly_report_template;
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
        note: "No hay workspaces con reporte semanal configurado (config.weekly_report_phone + weekly_report_template).",
      });
    }

    // Resolve workspace names for the message greeting.
    const wsIds = targets.map((t) => t.workspaceId);
    const { data: workspaces } = await supabase
      .from("workspaces")
      .select("id, name")
      .in("id", wsIds);
    const nameById = new Map<string, string>();
    for (const w of workspaces ?? []) {
      nameById.set(w.id as string, (w.name as string) ?? "tu negocio");
    }

    const { current } = lastNDaysWindows(7);
    let sent = 0;
    let skipped = 0;

    for (const t of targets) {
      const report = await computeRoiReport(
        t.workspaceId,
        current.from,
        current.to,
      );
      const summary = formatWeeklyReportMessage(
        nameById.get(t.workspaceId) ?? "tu negocio",
        report,
      );

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
          `[Cron weekly-report] send failed for ${t.workspaceId}:`,
          e,
        );
        return null;
      });

      if (result) sent++;
      else skipped++;
    }

    return NextResponse.json({ ok: true, sent, skipped });
  } catch (err) {
    console.error("[Cron weekly-report] exception:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "error" },
      { status: 500 },
    );
  }
}
