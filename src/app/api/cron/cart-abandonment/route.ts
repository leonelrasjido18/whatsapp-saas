import { NextResponse } from "next/server";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { dispatchText } from "@/features/inbox/services/dispatch";

// Recuperación de carritos abandonados: recuerda por WhatsApp los pedidos que
// quedaron 'pending' (sin pagar). Corre cada 1-2 horas. Sólo actúa dentro de la
// ventana de 24h de WhatsApp (2–18h desde la creación) — fuera de ahí WhatsApp
// exige templates aprobados y dispatchText devolvería WINDOW_EXPIRED.
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
    const from = new Date(now - 18 * 3600 * 1000).toISOString(); // no más viejo que 18h
    const to = new Date(now - 2 * 3600 * 1000).toISOString(); // al menos 2h

    const { data: orders, error } = await supabase
      .from("orders")
      .select("id, workspace_id, conversation_id, order_number, total")
      .eq("status", "pending")
      .is("reminder_sent_at", null)
      .not("conversation_id", "is", null)
      .gte("created_at", from)
      .lte("created_at", to)
      .limit(50);

    if (error) {
      console.error("[Cron cart-abandonment] fetch error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let sent = 0;
    let skipped = 0;

    for (const order of orders ?? []) {
      const total = Number(order.total).toLocaleString("es-AR");
      const body =
        `👋 ¿Seguís interesado? Tu pedido *#${order.order_number}* por *$${total}* ` +
        `sigue reservado. ¿Querés que te pase el link de pago para completarlo?`;

      const result = await dispatchText({
        workspaceId: order.workspace_id,
        conversationId: order.conversation_id as string,
        body,
      }).catch((e) => ({ ok: false, error: String(e) }));

      // Marcamos siempre para no reprocesar (si la ventana expiró, no hay reintento útil).
      await supabase
        .from("orders")
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq("id", order.id);

      if (result.ok) sent++;
      else skipped++;
    }

    return NextResponse.json({ ok: true, sent, skipped, total: orders?.length ?? 0 });
  } catch (err: any) {
    console.error("[Cron cart-abandonment] exception:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
