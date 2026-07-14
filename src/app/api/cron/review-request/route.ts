import { NextResponse } from "next/server";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { dispatchText, dispatchTemplate } from "@/features/inbox/services/dispatch";

// Post-sale Google review requests. For each workspace with reviews enabled and
// a review_url set, finds paid orders past the configured delay that haven't yet
// been asked, and sends a review link. In-window conversations get free text;
// out-of-window ones need an approved template (skipped if none configured).
// Mirrors the cart-abandonment cron's structure and 18h upper bound.
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

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  try {
    const { data: settingsRows } = await supabase
      .from("review_settings")
      .select("workspace_id, review_url, delay_hours, template_name")
      .eq("enabled", true)
      .not("review_url", "is", null);

    if (!settingsRows || settingsRows.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, note: "Sin workspaces con reseñas activas." });
    }

    let sent = 0;
    let skipped = 0;

    for (const s of settingsRows) {
      const wsId = s.workspace_id as string;
      const delayHours = (s.delay_hours as number) ?? 24;
      const templateName = s.template_name as string | null;

      const now = Date.now();
      // Only ask once the delay has elapsed, and stop asking after 7 days
      // (an old paid order isn't worth a late review nudge).
      const paidBefore = new Date(now - delayHours * 3600 * 1000).toISOString();
      const paidAfter = new Date(now - 7 * 24 * 3600 * 1000).toISOString();

      const { data: orders } = await supabase
        .from("orders")
        .select("id, conversation_id")
        .eq("workspace_id", wsId)
        .eq("status", "paid")
        .is("review_request_sent_at", null)
        .not("conversation_id", "is", null)
        .lte("paid_at", paidBefore)
        .gte("paid_at", paidAfter)
        .limit(50);

      for (const order of orders ?? []) {
        const link = `${appUrl}/r/${order.id}`;
        const body =
          `¡Gracias por tu compra! 🙌 ¿Nos dejarías una reseña? ` +
          `Nos ayuda un montón: ${link}`;

        let ok = false;
        const textResult = await dispatchText({
          workspaceId: wsId,
          conversationId: order.conversation_id as string,
          body,
        }).catch(() => ({ ok: false as const }));

        if (textResult.ok) {
          ok = true;
        } else if (templateName) {
          // Out of window → try the approved template (link goes via its button/body).
          const tplResult = await dispatchTemplate({
            workspaceId: wsId,
            conversationId: order.conversation_id as string,
            templateName,
          }).catch(() => ({ ok: false as const }));
          ok = tplResult.ok;
        }

        // Mark regardless so we don't retry a contact we can't reach.
        await supabase
          .from("orders")
          .update({ review_request_sent_at: new Date().toISOString() })
          .eq("id", order.id);

        if (ok) {
          sent++;
          await supabase.rpc("increment_review_requests_sent", {
            p_workspace_id: wsId,
          });
        } else {
          skipped++;
        }
      }
    }

    return NextResponse.json({ ok: true, sent, skipped });
  } catch (err) {
    console.error("[Cron review-request] exception:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "error" },
      { status: 500 },
    );
  }
}
