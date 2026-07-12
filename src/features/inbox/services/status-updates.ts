import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Shared outbound-message status transitions, used by both webhook routes
 * (YCloud per-mid statuses, Meta delivery mids + read watermarks).
 */

// WH-02: monotonic status order — never go backwards
const STATUS_ORDER = ["queued", "sent", "delivered", "read"] as const;
type OrderedStatus = (typeof STATUS_ORDER)[number];
type MessageStatus = OrderedStatus | "failed";

/**
 * Applies a status update to the message identified by its provider message id
 * (WhatsApp wamid or Meta mid — both live in messages.wamid). Ordered statuses
 * only ever advance; 'failed' is terminal and always applied.
 */
export async function applyMessageStatusUpdate(
  supabase: SupabaseClient,
  providerMessageId: string,
  newStatus: string,
): Promise<void> {
  const { data: msg } = await supabase
    .from("messages")
    .select("id, status")
    .eq("wamid", providerMessageId)
    .single();

  // Message not found — can happen for outbound we didn't track
  if (!msg) return;

  const current = msg.status as MessageStatus | null;

  // 'failed' is terminal — always apply regardless of current state
  if (newStatus === "failed") {
    await supabase
      .from("messages")
      .update({ status: "failed" })
      .eq("id", msg.id);
    return;
  }

  // For ordered statuses: only advance, never go back
  const currentIdx = current
    ? STATUS_ORDER.indexOf(current as OrderedStatus)
    : -1;
  const newIdx = STATUS_ORDER.indexOf(newStatus as OrderedStatus);

  if (newIdx > currentIdx) {
    await supabase
      .from("messages")
      .update({ status: newStatus })
      .eq("id", msg.id);
  }
  // else: same or lower status — ignore (monotonic guarantee)
}

/**
 * Meta read/delivery semantics: the webhook reports a WATERMARK (epoch ms),
 * not per-message receipts — every outbound message created before it reached
 * the given status. Monotonic by construction (status only moves forward).
 */
export async function markConversationOutboundBeforeWatermark(
  supabase: SupabaseClient,
  conversationId: string,
  watermarkMs: number,
  newStatus: "delivered" | "read",
): Promise<void> {
  const fromStatuses =
    newStatus === "read" ? ["sent", "delivered"] : ["queued", "sent"];

  await supabase
    .from("messages")
    .update({ status: newStatus })
    .eq("conversation_id", conversationId)
    .eq("direction", "out")
    .in("status", fromStatuses)
    .lte("created_at", new Date(watermarkMs).toISOString());
}
