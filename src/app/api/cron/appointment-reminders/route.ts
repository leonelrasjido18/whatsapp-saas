import { NextResponse } from "next/server";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { dispatchText } from "@/features/inbox/services/dispatch";

// Appointment reminders: nudges confirmed appointments ~24h out (window: 20–28h
// before start) once, over WhatsApp. Only sends within the 24h messaging window
// (dispatchText returns WINDOW_EXPIRED otherwise); marks reminder_sent_at either
// way so it isn't retried. Runs hourly.
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
    const now = Date.now();
    const from = new Date(now + 20 * 3600 * 1000).toISOString();
    const to = new Date(now + 28 * 3600 * 1000).toISOString();

    const { data: appts } = await supabase
      .from("bookings")
      .select("id, workspace_id, conversation_id, starts_at, customer_name")
      .eq("status", "confirmed")
      .is("reminder_sent_at", null)
      .not("conversation_id", "is", null)
      .gte("starts_at", from)
      .lte("starts_at", to)
      .limit(100);

    let sent = 0;
    let skipped = 0;

    for (const appt of appts ?? []) {
      const when = new Date(appt.starts_at as string).toLocaleString("es-AR", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
      });
      const body =
        `👋 Te recordamos tu turno para *${when}*. ` +
        `Respondé *CONFIRMAR* para confirmarlo o *CANCELAR* si no vas a poder venir.`;

      const result = await dispatchText({
        workspaceId: appt.workspace_id as string,
        conversationId: appt.conversation_id as string,
        body,
      }).catch(() => ({ ok: false as const }));

      await supabase
        .from("bookings")
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq("id", appt.id);

      if (result.ok) sent++;
      else skipped++;
    }

    return NextResponse.json({ ok: true, sent, skipped });
  } catch (err) {
    console.error("[Cron appointment-reminders] exception:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "error" },
      { status: 500 },
    );
  }
}
