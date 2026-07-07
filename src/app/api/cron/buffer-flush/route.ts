import { NextResponse } from "next/server";
import { processNextBatch } from "@/features/inbox/services/buffer";

// ──────────────────────────────────────────────────────────────────────────────
// Vercel Cron: process buffer batches every minute
//
// For production at scale, consider:
//   - pg_cron every 5s for lower latency
//   - pgmq (message queue) for fan-out across multiple workers
//
// Vercel sets Authorization: Bearer {CRON_SECRET} automatically when the
// cron job is configured in vercel.json.
// ──────────────────────────────────────────────────────────────────────────────

export const schedule = "* * * * *";

// Max batches to drain per cron tick — protects against burst accumulation
const MAX_BATCHES_PER_RUN = 10;

export async function GET(request: Request): Promise<NextResponse> {
  // Verify Vercel cron auth header
  const authHeader = request.headers.get("Authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: Array<{ processed: boolean; error?: string }> = [];

  for (let i = 0; i < MAX_BATCHES_PER_RUN; i++) {
    const result = await processNextBatch();
    results.push(result);

    // No more ready batches — stop early
    if (!result.processed) break;
  }

  const processedCount = results.filter((r) => r.processed).length;

  return NextResponse.json({ ok: true, processed: processedCount });
}
