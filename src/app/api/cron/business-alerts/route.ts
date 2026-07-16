import { NextResponse } from "next/server";
import { runBusinessAlerts } from "@/features/monitoring/services/business-alerts";

// #5 Owner-facing operational alerts: low stock + human-handoff backlog. Raised
// as workspace-level alerts the owner sees in their dashboard. Hourly.
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const summary = await runBusinessAlerts();
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    console.error("[Cron business-alerts] exception:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "error" },
      { status: 500 },
    );
  }
}
