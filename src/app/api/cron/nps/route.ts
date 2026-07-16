// NPS (#8) — one hourly cron that does two things:
//   1) SEND: for paid orders older than ~2h without an NPS request, send the
//      survey template ("del 0 al 10, ¿nos recomendarías?") and record a pending
//      nps_responses row. Gated on config.nps_template (+ phone), like the other
//      proactive messages that live outside the 24h window.
//   2) COLLECT: for pending requests (<48h), scan the customer's later inbound
//      messages for a 0-10 number and record it. Done as a batch scan so we never
//      touch the live inbound pipeline.

import { NextResponse } from "next/server";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { sendTemplate } from "@/features/inbox/services/ycloud-client";

function extractScore(text: string): number | null {
  // First standalone number 0-10 in the message.
  const m = text.match(/\b(10|[0-9])\b/);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 0 && n <= 10 ? n : null;
}

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

  const now = Date.now();
  let requested = 0;
  let collected = 0;

  try {
    // ── 1) SEND ──────────────────────────────────────────────────────────────
    const { data: integrations } = await supabase
      .from("integrations")
      .select("workspace_id, credentials, config")
      .eq("provider", "ycloud")
      .eq("enabled", true);

    for (const it of integrations ?? []) {
      const config = (it.config as Record<string, unknown> | null) ?? {};
      const creds = (it.credentials as Record<string, unknown> | null) ?? {};
      const template = config.nps_template;
      const apiKey = creds.ycloud_api_key;
      const fromPhone = config.phone_number;
      if (
        typeof template !== "string" || !template ||
        typeof apiKey !== "string" || !apiKey || apiKey === "placeholder" ||
        typeof fromPhone !== "string" || !fromPhone
      ) {
        continue;
      }
      const workspaceId = it.workspace_id as string;
      const language = typeof config.nps_language === "string" ? config.nps_language : "es";

      // Paid orders 2h-72h old, not yet surveyed.
      const paidFrom = new Date(now - 72 * 3600 * 1000).toISOString();
      const paidTo = new Date(now - 2 * 3600 * 1000).toISOString();
      const { data: orders } = await supabase
        .from("orders")
        .select("id, contact_id, conversation_id, paid_at, contact:contacts(phone, opt_in)")
        .eq("workspace_id", workspaceId)
        .eq("status", "paid")
        .gte("paid_at", paidFrom)
        .lte("paid_at", paidTo)
        .limit(50);

      for (const o of orders ?? []) {
        const orderId = o.id as string;
        // Skip if already requested.
        const { data: existing } = await supabase
          .from("nps_responses")
          .select("id")
          .eq("order_id", orderId)
          .maybeSingle();
        if (existing) continue;

        const contact = o.contact as unknown as { phone: string | null; opt_in: boolean } | null;
        if (!contact?.phone || !contact.opt_in) continue;

        const sent = await sendTemplate({
          apiKey,
          from: fromPhone,
          to: contact.phone,
          templateName: template,
          language,
        }).catch((e) => {
          console.error("[Cron nps] send failed:", e);
          return null;
        });
        if (!sent) continue;

        await supabase.from("nps_responses").insert({
          workspace_id: workspaceId,
          order_id: orderId,
          contact_id: o.contact_id as string,
          conversation_id: o.conversation_id as string | null,
          requested_at: new Date().toISOString(),
        });
        requested++;
      }
    }

    // ── 2) COLLECT ──────────────────────────────────────────────────────────
    const pendingFrom = new Date(now - 48 * 3600 * 1000).toISOString();
    const { data: pending } = await supabase
      .from("nps_responses")
      .select("id, contact_id, requested_at")
      .is("score", null)
      .gte("requested_at", pendingFrom)
      .limit(200);

    for (const p of pending ?? []) {
      const contactId = p.contact_id as string | null;
      if (!contactId) continue;

      // Find the customer's inbound messages after the request.
      const { data: replies } = await supabase
        .from("messages")
        .select("body")
        .eq("direction", "in")
        .gte("created_at", p.requested_at as string)
        .in(
          "conversation_id",
          (
            await supabase
              .from("conversations")
              .select("id")
              .eq("contact_id", contactId)
          ).data?.map((c) => c.id as string) ?? [],
        )
        .order("created_at", { ascending: true })
        .limit(10);

      let score: number | null = null;
      for (const r of replies ?? []) {
        const s = extractScore((r.body as string | null) ?? "");
        if (s !== null) {
          score = s;
          break;
        }
      }
      if (score !== null) {
        await supabase
          .from("nps_responses")
          .update({ score, responded_at: new Date().toISOString() })
          .eq("id", p.id as string);
        collected++;
      }
    }

    return NextResponse.json({ ok: true, requested, collected });
  } catch (err) {
    console.error("[Cron nps] exception:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "error" },
      { status: 500 },
    );
  }
}
