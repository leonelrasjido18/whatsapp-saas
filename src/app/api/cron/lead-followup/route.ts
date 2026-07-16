// lead-followup (#9) — nudges warm leads that went quiet. Compliant by design:
// only touches conversations whose 24h window is still OPEN (so it's free-form,
// no template needed), where the AGENT spoke last and the customer went silent,
// and no order was placed. One nudge per conversation (deduped via a message
// meta flag). Opt-in per workspace via config.lead_followup_enabled.

import { NextResponse } from "next/server";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { dispatchText } from "@/features/inbox/services/dispatch";

const NUDGE =
  "¿Pudiste verlo? Si querés te ayudo a cerrarlo o te resuelvo cualquier duda 😊";

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
    // Workspaces that opted in.
    const { data: integrations } = await supabase
      .from("integrations")
      .select("workspace_id, config")
      .eq("provider", "ycloud")
      .eq("enabled", true);

    const enabledWs = new Set(
      (integrations ?? [])
        .filter(
          (it) =>
            (it.config as Record<string, unknown> | null)
              ?.lead_followup_enabled === true,
        )
        .map((it) => it.workspace_id as string),
    );

    if (enabledWs.size === 0) {
      return NextResponse.json({ ok: true, sent: 0, note: "Nadie con lead_followup_enabled." });
    }

    const now = Date.now();
    const idleFrom = new Date(now - 20 * 3600 * 1000).toISOString(); // >= 20h? no
    const idleTo = new Date(now - 4 * 3600 * 1000).toISOString();

    // Open, AI-on conversations that went quiet 4-20h ago.
    const { data: convs } = await supabase
      .from("conversations")
      .select("id, workspace_id, contact_id, last_message_at, window_expires_at, ai_enabled")
      .in("workspace_id", Array.from(enabledWs))
      .eq("ai_enabled", true)
      .gt("window_expires_at", new Date(now).toISOString())
      .lte("last_message_at", idleTo)
      .gte("last_message_at", idleFrom);

    let sent = 0;
    for (const conv of convs ?? []) {
      const convId = conv.id as string;

      // Last message must be from the agent (customer went silent), and there
      // must be no prior follow-up (we dedupe on the fixed nudge text).
      const { data: lastMsgs } = await supabase
        .from("messages")
        .select("direction, body")
        .eq("conversation_id", convId)
        .order("created_at", { ascending: false })
        .limit(15);

      const rows = lastMsgs ?? [];
      if (rows.length === 0) continue;
      if ((rows[0].direction as string) !== "out") continue; // customer spoke last → agent will handle
      const alreadyNudged = rows.some((m) => (m.body as string | null) === NUDGE);
      if (alreadyNudged) continue;

      // No order placed in this conversation.
      const { count: orderCount } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", convId);
      if ((orderCount ?? 0) > 0) continue;

      const result = await dispatchText({
        workspaceId: conv.workspace_id as string,
        conversationId: convId,
        body: NUDGE,
      });
      if (result.ok) sent++;
    }

    return NextResponse.json({ ok: true, sent });
  } catch (err) {
    console.error("[Cron lead-followup] exception:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "error" },
      { status: 500 },
    );
  }
}
