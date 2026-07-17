// recurring-orders — creates due recurring orders and reminds the customer to
// confirm/pay, then advances next_run. Daily.

import { NextResponse } from "next/server";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { createOrder } from "@/features/commerce/services/orders";
import { dispatchText } from "@/features/inbox/services/dispatch";

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

  const today = new Date().toISOString().slice(0, 10);
  let created = 0;

  try {
    const { data: due } = await supabase
      .from("recurring_orders")
      .select("id, workspace_id, contact_id, conversation_id, items, frequency_days")
      .eq("active", true)
      .lte("next_run", today)
      .limit(200);

    for (const r of due ?? []) {
      const items = r.items as Array<{ product_id: string; qty: number }>;
      try {
        const order = await createOrder(
          supabase,
          r.workspace_id as string,
          null,
          {
            contact_id: r.contact_id as string,
            conversation_id: (r.conversation_id as string | null) ?? undefined,
            source: "chat",
            items,
          },
        );

        // Remind the customer (inside window → free text; otherwise it just
        // sits as a pending order they'll see next time they write).
        if (r.conversation_id) {
          await dispatchText({
            workspaceId: r.workspace_id as string,
            conversationId: r.conversation_id as string,
            body: `¡Hola! Preparamos tu pedido de siempre (pedido #${order.order_number}). ¿Te lo confirmo y coordinamos el pago?`,
          });
        }
        created++;
      } catch (e) {
        console.error("[Cron recurring-orders] create failed:", e);
      }

      // Advance next_run regardless of send success.
      const next = new Date(
        Date.now() + (r.frequency_days as number) * 86400000,
      )
        .toISOString()
        .slice(0, 10);
      await supabase
        .from("recurring_orders")
        .update({ next_run: next })
        .eq("id", r.id as string);
    }

    return NextResponse.json({ ok: true, created });
  } catch (err) {
    console.error("[Cron recurring-orders] exception:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "error" },
      { status: 500 },
    );
  }
}
