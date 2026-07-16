import { NextResponse } from "next/server";
import { runHealthCheck } from "@/features/monitoring/services/health-check";

// #6 Uptime / monitoring. Sweeps every workspace's integrations and the AI
// pipeline, raising/resolving alerts in system_alerts. Scheduled every 10 min.
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const summary = await runHealthCheck();
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    console.error("[Cron health-check] exception:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "error" },
      { status: 500 },
    );
  }
}
