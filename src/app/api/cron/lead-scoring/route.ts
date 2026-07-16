import { NextResponse } from "next/server";
import { runLeadScoring } from "@/features/inbox/services/lead-scoring";

// Recomputes lead heat scores for recently-active contacts. Daily.
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const summary = await runLeadScoring();
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    console.error("[Cron lead-scoring] exception:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "error" },
      { status: 500 },
    );
  }
}
