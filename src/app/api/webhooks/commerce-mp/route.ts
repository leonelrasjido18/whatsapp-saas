import { NextRequest, NextResponse } from "next/server";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";
import { getPayment } from "@/features/commerce/services/mercadopago";
import { getValidMpAccessToken } from "@/features/commerce/services/mercadopago-oauth";
import { applyOrderPayment, refundOrder } from "@/features/commerce/services/orders";
import { dispatchText } from "@/features/inbox/services/dispatch";

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * Verifies MercadoPago webhook HMAC signature.
 * Docs: https://www.mercadopago.com.ar/developers/es/docs/your-integrations/notifications/webhooks
 */
function verifyMpSignature(req: NextRequest, rawBody: string, secret: string): boolean {
  try {
    const xSignature = req.headers.get("x-signature");
    const xRequestId = req.headers.get("x-request-id");
    if (!xSignature || !xRequestId) return false;

    // Parse ts and v1 from header like: ts=123456,v1=abcdef...
    const parts = Object.fromEntries(xSignature.split(",").map((p) => p.split("=")));
    const ts = parts["ts"];
    const v1 = parts["v1"];
    if (!ts || !v1) return false;

    const dataId = new URL(req.url).searchParams.get("data.id") ?? "";
    const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
    const hmac = createHmac("sha256", secret).update(manifest).digest("hex");
    return hmac === v1;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  let rawBody = "";
  try {
    rawBody = await req.text();
  } catch {
    return NextResponse.json({ success: true }, { status: 200 });
  }

  try {
    const url = new URL(req.url);
    const type = url.searchParams.get("type") || url.searchParams.get("topic");

    if (type !== "payment") {
      return NextResponse.json({ success: true }, { status: 200 });
    }

    const workspaceId = url.searchParams.get("workspace_id");
    if (!workspaceId) {
      console.error("[Commerce MP Webhook] Missing workspace_id in query");
      return NextResponse.json({ success: true }, { status: 200 });
    }

    const supabase = svc();
    const { data: integration } = await supabase
      .from("integrations")
      .select("credentials")
      .eq("workspace_id", workspaceId)
      .eq("provider", "mercadopago")
      .single();

    const mp_webhook_secret = integration?.credentials?.mp_webhook_secret;
    // OAuth token (auto-refreshed) or the legacy manually-pasted token.
    const mp_access_token = await getValidMpAccessToken(supabase, workspaceId);

    if (!mp_access_token) {
      console.error("[Commerce MP Webhook] Workspace missing MP token");
      return NextResponse.json({ success: true }, { status: 200 });
    }

    // Verify HMAC signature if secret is configured
    if (mp_webhook_secret) {
      const valid = verifyMpSignature(req, rawBody, mp_webhook_secret);
      if (!valid) {
        console.warn("[Commerce MP Webhook] Invalid HMAC signature — rejecting");
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    }

    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ success: true }, { status: 200 });
    }

    const paymentId = body.data?.id ?? url.searchParams.get("data.id") ?? url.searchParams.get("id");
    if (!paymentId) {
      return NextResponse.json({ success: true }, { status: 200 });
    }

    const paymentInfo = await getPayment(mp_access_token, paymentId);

    // Anti-spoofing: validate external_reference belongs to this workspace
    const orderId = paymentInfo.metadata?.order_id ?? paymentInfo.external_reference;
    if (!orderId) {
      console.warn("[Commerce MP Webhook] Payment has no order reference");
      return NextResponse.json({ success: true }, { status: 200 });
    }

    const { data: orderData } = await supabase
      .from("orders")
      .select("id, workspace_id, order_number, conversation_id, contact_id")
      .eq("id", orderId)
      .eq("workspace_id", workspaceId) // Anti-spoofing: must belong to same workspace
      .single();

    if (!orderData) {
      console.warn(`[Commerce MP Webhook] Order ${orderId} not found in workspace ${workspaceId}`);
      return NextResponse.json({ success: true }, { status: 200 });
    }

    if (paymentInfo.status === "approved") {
      const updated = await applyOrderPayment(
        supabase,
        workspaceId,
        orderId,
        null,
        "mercadopago",
        String(paymentId)
      );

      // Only notify if the state actually changed (idempotency guard)
      if (updated && orderData.conversation_id) {
        // Fire-and-forget — don't block the webhook response
        void dispatchText({
          workspaceId,
          conversationId: orderData.conversation_id,
          body: `✅ ¡Pago recibido! Tu pedido #${orderData.order_number} fue confirmado. ¡Gracias!`,
        }).catch((err) =>
          console.warn("[Commerce MP Webhook] dispatchText failed:", err)
        );
      }
    } else if (paymentInfo.status === "refunded" || (paymentInfo as any).action === "payment.refunded") {
      await refundOrder(supabase, workspaceId, orderId, null);
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("[Commerce MP Webhook Error]:", error);
    // Always return 200 so MP stops retrying on transient errors
    return NextResponse.json({ success: true }, { status: 200 });
  }
}
