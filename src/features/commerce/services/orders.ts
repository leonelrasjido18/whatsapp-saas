import { SupabaseClient } from "@supabase/supabase-js";
import { recomputeContactTier } from "@/lib/tiering-rules";
import { Order } from "../types";

export interface CreateOrderPayload {
  contact_id?: string;
  conversation_id?: string;
  source: "chat" | "manual";
  items: Array<{ product_id: string; qty: number }>;
  note?: string;
  channel?: string;
  discount?: number;
  /** Coupon applied to this order (already validated); redeemed after creation. */
  coupon_id?: string;
}

/**
 * Creates an order and, when a validated coupon is attached, redeems it
 * atomically afterward. If redemption fails (e.g. the coupon was exhausted
 * between validation and creation) the order still stands — the discount was
 * already priced in, and burning nothing is the safe failure mode.
 */
export async function createOrderWithCoupon(
  supabase: SupabaseClient,
  workspaceId: string,
  userId: string | null,
  payload: CreateOrderPayload,
) {
  const order = await createOrder(supabase, workspaceId, userId, payload);
  if (payload.coupon_id) {
    const { redeemCoupon } = await import("./coupons");
    await redeemCoupon(supabase, payload.coupon_id).catch(() => false);
  }
  return order;
}

export async function createOrder(
  supabase: SupabaseClient,
  workspaceId: string,
  userId: string | null,
  payload: CreateOrderPayload
) {
  const { data, error } = await supabase.rpc("create_order_with_items", {
    p_workspace_id: workspaceId,
    p_contact_id: payload.contact_id || null,
    p_conversation_id: payload.conversation_id || null,
    p_source: payload.source,
    p_items: payload.items,
    p_note: payload.note || null,
    p_created_by: userId,
    p_channel: payload.channel || null,
    p_discount: payload.discount || 0
  });

  if (error) throw error;
  return data as Order;
}

export async function getOrders(
  supabase: SupabaseClient,
  workspaceId: string,
  options?: { status?: Order["status"] }
) {
  let query = supabase
    .from("orders")
    .select(`
      *,
      items:order_items(*)
    `)
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (options?.status) {
    query = query.eq("status", options.status);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data as Order[];
}

export async function getOrder(
  supabase: SupabaseClient,
  workspaceId: string,
  orderId: string
) {
  const { data, error } = await supabase
    .from("orders")
    .select(`
      *,
      items:order_items(*)
    `)
    .eq("workspace_id", workspaceId)
    .eq("id", orderId)
    .single();

  if (error) throw error;
  return data as Order;
}

export async function applyOrderPayment(
  supabase: SupabaseClient,
  workspaceId: string,
  orderId: string,
  userId: string | null,
  paymentMethod: string,
  mpPaymentId?: string
) {
  const { data, error } = await supabase.rpc("apply_order_payment", {
    p_workspace_id: workspaceId,
    p_order_id: orderId,
    p_payment_method: paymentMethod,
    p_mp_payment_id: mpPaymentId || null,
    p_user_id: userId
  });

  if (error) throw error;

  // Recompute tier for this contact
  const { data: order } = await supabase
    .from("orders")
    .select("contact_id, conversation_id")
    .eq("id", orderId)
    .single();

  if (order?.contact_id) {
    await recomputeContactTier(supabase, workspaceId, order.contact_id);
  }

  // Sales pipeline: on payment, hand the conversation to Posventa (agendamiento).
  // No-op when the workspace pipeline is disabled or the order has no conversation.
  if (order?.conversation_id) {
    const { data: ws } = await supabase
      .from("workspaces")
      .select("sales_pipeline_enabled")
      .eq("id", workspaceId)
      .maybeSingle();

    if (ws?.sales_pipeline_enabled) {
      await supabase
        .from("conversations")
        .update({ pipeline_stage: "agendamiento" })
        .eq("id", order.conversation_id)
        .eq("workspace_id", workspaceId);
    }
  }

  return data;
}

export async function cancelOrder(
  supabase: SupabaseClient,
  workspaceId: string,
  orderId: string,
  userId: string | null
) {
  const { data, error } = await supabase.rpc("cancel_order", {
    p_workspace_id: workspaceId,
    p_order_id: orderId,
    p_user_id: userId
  });

  if (error) throw error;
  return data;
}

export async function refundOrder(
  supabase: SupabaseClient,
  workspaceId: string,
  orderId: string,
  userId: string | null
) {
  const { data, error } = await supabase.rpc("refund_order", {
    p_workspace_id: workspaceId,
    p_order_id: orderId,
    p_user_id: userId
  });

  if (error) throw error;
  
  // Recompute tier for this contact
  const { data: order } = await supabase
    .from("orders")
    .select("contact_id")
    .eq("id", orderId)
    .single();

  if (order?.contact_id) {
    await recomputeContactTier(supabase, workspaceId, order.contact_id);
  }

  return data;
}
