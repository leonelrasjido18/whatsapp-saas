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
    .select("contact_id")
    .eq("id", orderId)
    .single();

  if (order?.contact_id) {
    await recomputeContactTier(supabase, workspaceId, order.contact_id);
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
