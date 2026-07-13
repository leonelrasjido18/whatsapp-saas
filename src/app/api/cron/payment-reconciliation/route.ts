import { NextResponse } from "next/server";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { findApprovedPayment } from "@/features/commerce/services/mercadopago";
import { applyOrderPayment } from "@/features/commerce/services/orders";
import { dispatchText } from "@/features/inbox/services/dispatch";

// Reconciliación de pagos: si el webhook de MercadoPago no llegó (caída, red),
// una orden pagada queda 'pending' para siempre. Este cron busca en MP los pagos
// aprobados de las órdenes pendientes con preferencia MP y las confirma.
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
    const from = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();

    const { data: orders, error } = await supabase
      .from("orders")
      .select("id, workspace_id, order_number, conversation_id")
      .eq("status", "pending")
      .not("mp_preference_id", "is", null)
      .gte("created_at", from)
      .limit(50);

    if (error) {
      console.error("[Cron payment-reconciliation] fetch error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Cache de tokens por workspace para no repetir queries.
    const tokenCache = new Map<string, string | null>();
    async function getToken(wsId: string): Promise<string | null> {
      if (tokenCache.has(wsId)) return tokenCache.get(wsId)!;
      const { data: integration } = await supabase
        .from("integrations")
        .select("credentials")
        .eq("workspace_id", wsId)
        .eq("provider", "mercadopago")
        .single();
      const token =
        (integration?.credentials?.mp_access_token as string | undefined) ?? null;
      tokenCache.set(wsId, token);
      return token;
    }

    let reconciled = 0;

    for (const order of orders ?? []) {
      const token = await getToken(order.workspace_id);
      if (!token) continue;

      let approved: { id: string } | null = null;
      try {
        approved = await findApprovedPayment(token, order.id);
      } catch (e) {
        console.warn("[Cron payment-reconciliation] MP search failed:", e);
        continue;
      }
      if (!approved) continue;

      try {
        const updated = await applyOrderPayment(
          supabase,
          order.workspace_id,
          order.id,
          null,
          "mercadopago",
          approved.id,
        );
        reconciled++;

        if (updated && order.conversation_id) {
          void dispatchText({
            workspaceId: order.workspace_id,
            conversationId: order.conversation_id as string,
            body: `✅ ¡Pago recibido! Tu pedido #${order.order_number} fue confirmado. ¡Gracias!`,
          }).catch(() => {});
        }
      } catch (e) {
        console.error("[Cron payment-reconciliation] apply failed:", e);
      }
    }

    return NextResponse.json({ ok: true, reconciled, checked: orders?.length ?? 0 });
  } catch (err: any) {
    console.error("[Cron payment-reconciliation] exception:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
