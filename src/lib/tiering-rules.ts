import { SupabaseClient } from "@supabase/supabase-js";

export type CustomerTier = "new" | "regular" | "vip" | "inactive";

export const TIER_THRESHOLDS = {
  vip: 500000, // ARS 500k to become VIP
  regular: 100000, // ARS 100k to become regular
};

export const INACTIVITY_DAYS = 90; // Become inactive after 90 days

/**
 * Computes the new tier for a contact based on their total spent and last purchase date.
 */
export function computeTier(totalSpent: number, lastPurchaseAt: Date | null): CustomerTier {
  if (!lastPurchaseAt) return "new";

  const daysSinceLastPurchase = (new Date().getTime() - lastPurchaseAt.getTime()) / (1000 * 60 * 60 * 24);

  if (daysSinceLastPurchase > INACTIVITY_DAYS) {
    return "inactive";
  }

  if (totalSpent >= TIER_THRESHOLDS.vip) {
    return "vip";
  }

  if (totalSpent >= TIER_THRESHOLDS.regular) {
    return "regular";
  }

  return "new";
}

/**
 * Recomputes and updates the contact's total spent, last purchase date, and tier.
 * This should be called after a new payment is successfully applied.
 */
export async function recomputeContactTier(
  supabase: SupabaseClient,
  workspaceId: string,
  contactId: string
) {
  // 1. Calculate total spent and last purchase from paid orders
  const { data: orders, error: ordersError } = await supabase
    .from("orders")
    .select("total, paid_at")
    .eq("workspace_id", workspaceId)
    .eq("contact_id", contactId)
    .eq("status", "paid");

  if (ordersError) {
    console.error(`[Tiering] Failed to fetch orders for contact ${contactId}`, ordersError);
    return;
  }

  let totalSpent = 0;
  let lastPurchaseAt: Date | null = null;

  for (const order of orders || []) {
    totalSpent += Number(order.total);
    if (order.paid_at) {
      const paidDate = new Date(order.paid_at);
      if (!lastPurchaseAt || paidDate > lastPurchaseAt) {
        lastPurchaseAt = paidDate;
      }
    }
  }

  // 2. Compute new tier
  const newTier = computeTier(totalSpent, lastPurchaseAt);

  // 3. Update contact
  const { error: updateError } = await supabase
    .from("contacts")
    .update({
      total_spent: totalSpent,
      last_purchase_at: lastPurchaseAt?.toISOString() || null,
      customer_tier: newTier
    })
    .eq("id", contactId)
    .eq("workspace_id", workspaceId);

  if (updateError) {
    console.error(`[Tiering] Failed to update contact ${contactId}`, updateError);
  }
}
