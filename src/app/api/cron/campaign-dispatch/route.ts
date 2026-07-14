import { NextResponse } from "next/server";
import { createClient as createSbClient } from "@supabase/supabase-js";
import {
  materializeRecipients,
  dispatchCampaignBatch,
} from "@/features/campaigns/services/dispatch";
import type { Campaign } from "@/features/campaigns/types";

// Campaign dispatcher. Every minute it (1) promotes any scheduled campaign whose
// time has arrived to 'sending', (2) materializes recipients for sending
// campaigns that have none yet, and (3) sends one rate-limited batch per active
// campaign. Large campaigns drain across many ticks. Same pg_cron pattern as
// buffer-flush.
export const maxDuration = 60;

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
    // 1. Promote due scheduled campaigns to 'sending'.
    await supabase
      .from("campaigns")
      .update({ status: "sending", started_at: new Date().toISOString() })
      .eq("status", "scheduled")
      .lte("scheduled_at", new Date().toISOString());

    // 2. Fetch active campaigns.
    const { data: active } = await supabase
      .from("campaigns")
      .select("*")
      .eq("status", "sending")
      .limit(20);

    const campaigns = (active ?? []) as Campaign[];
    let processed = 0;

    for (const campaign of campaigns) {
      // Ensure recipients exist (idempotent). If the audience is empty, the
      // batch dispatcher will finalize it as done.
      if ((campaign.stats?.total ?? 0) === 0) {
        await materializeRecipients(supabase, campaign).catch((e) =>
          console.error("[campaign-dispatch] materialize failed:", e),
        );
      }
      const count = await dispatchCampaignBatch(supabase, campaign).catch(
        (e) => {
          console.error("[campaign-dispatch] batch failed:", e);
          return 0;
        },
      );
      processed += count;
    }

    return NextResponse.json({ ok: true, campaigns: campaigns.length, processed });
  } catch (err) {
    console.error("[Cron campaign-dispatch] exception:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "error" },
      { status: 500 },
    );
  }
}
