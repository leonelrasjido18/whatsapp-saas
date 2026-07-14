// Discount coupons — validation, discount computation and atomic redemption.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface Coupon {
  id: string;
  code: string;
  discount_type: "percent" | "amount";
  discount_value: number;
  min_order_total: number;
  max_uses: number | null;
  uses: number;
  active: boolean;
  expires_at: string | null;
}

export interface CouponValidation {
  ok: boolean;
  coupon?: Coupon;
  discount?: number; // computed against the given subtotal
  error?: string;
}

/**
 * Validates a coupon code against a subtotal and returns the discount amount
 * (capped at the subtotal). Does NOT redeem — call redeemCoupon after the order
 * is created so a failed order doesn't burn a use.
 */
export async function validateCoupon(
  supabase: SupabaseClient,
  workspaceId: string,
  code: string,
  subtotal: number,
): Promise<CouponValidation> {
  const normalized = code.trim().toUpperCase();
  const { data } = await supabase
    .from("coupons")
    .select(
      "id, code, discount_type, discount_value, min_order_total, max_uses, uses, active, expires_at",
    )
    .eq("workspace_id", workspaceId)
    .eq("code", normalized)
    .maybeSingle();

  const coupon = data as Coupon | null;
  if (!coupon || !coupon.active) {
    return { ok: false, error: "El cupón no existe o no está activo" };
  }
  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
    return { ok: false, error: "El cupón venció" };
  }
  if (coupon.max_uses !== null && coupon.uses >= coupon.max_uses) {
    return { ok: false, error: "El cupón alcanzó su límite de usos" };
  }
  if (subtotal < coupon.min_order_total) {
    return {
      ok: false,
      error: `El cupón requiere un mínimo de $${coupon.min_order_total.toLocaleString("es-AR")}`,
    };
  }

  const raw =
    coupon.discount_type === "percent"
      ? (subtotal * coupon.discount_value) / 100
      : coupon.discount_value;
  const discount = Math.min(Math.round(raw * 100) / 100, subtotal);

  return { ok: true, coupon, discount };
}

/** Atomically redeems a coupon (capacity/expiry re-checked in the RPC). */
export async function redeemCoupon(
  supabase: SupabaseClient,
  couponId: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("redeem_coupon", {
    p_coupon_id: couponId,
  });
  if (error) {
    console.error("[coupons] redeem error:", error);
    return false;
  }
  return Boolean(data);
}

/**
 * Computes the subtotal of a set of catalog items by looking up current prices.
 * Used to validate percentage coupons before the order RPC runs.
 */
export async function computeSubtotal(
  supabase: SupabaseClient,
  workspaceId: string,
  items: Array<{ product_id: string; qty: number }>,
): Promise<number> {
  const ids = items.map((i) => i.product_id);
  const { data } = await supabase
    .from("products")
    .select("id, price")
    .eq("workspace_id", workspaceId)
    .in("id", ids);

  const priceById = new Map(
    (data ?? []).map((p) => [p.id as string, Number(p.price)]),
  );
  return items.reduce(
    (sum, i) => sum + (priceById.get(i.product_id) ?? 0) * i.qty,
    0,
  );
}
