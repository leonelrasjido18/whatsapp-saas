import { z } from "zod";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { Tool } from "../core/tool";
import { createOrderWithCoupon } from "@/features/commerce/services/orders";
import {
  validateCoupon,
  computeSubtotal,
} from "@/features/commerce/services/coupons";
import { hasFeature } from "@/features/billing/plans";
import type { PlanTier } from "@/features/billing/plans";

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function getWorkspaceTier(workspaceId: string): Promise<PlanTier> {
  const { data } = await svc()
    .from("workspaces")
    .select("plan_tier")
    .eq("id", workspaceId)
    .single();
  return (data?.plan_tier as PlanTier) ?? "starter";
}

const schema = z.object({
  items: z
    .array(
      z.object({
        product_id: z.string().uuid().describe("ID del producto obtenido de catalog_search"),
        qty: z.number().int().min(1).describe("Cantidad"),
      })
    )
    .min(1)
    .describe("Lista de artículos a comprar. Solo pasar cuando el cliente CONFIRME la compra."),
  note: z.string().optional().describe("Notas del pedido (ej. 'Sin picante', 'Envío a calle X')"),
  coupon_code: z
    .string()
    .optional()
    .describe("Código de cupón de descuento si el cliente tiene uno."),
});

export const createOrderTool: Tool<z.infer<typeof schema>> = {
  name: "create_order",
  description:
    "Crea un pedido cuando el cliente CONFIRMA que quiere comprar. Los precios se toman de la base de datos — nunca los pases como parámetro. Después de crear, informa el número de orden y el total. Si el comercio tiene MercadoPago, usa generate_payment_link para ofrecer pago digital. Si falla por sin_stock, informar al cliente que el producto está agotado.",
  sensitivity: "write",
  schema,
  enabledFor: async (workspaceId) => {
    const tier = await getWorkspaceTier(workspaceId);
    return hasFeature(tier, "ai_sales_tools");
  },
  run: async (args, ctx) => {
    try {
      const supabase = svc();

      // Resolve and validate a coupon before creating the order, so the
      // discount is priced into the order total. Redemption happens after
      // creation inside createOrderWithCoupon.
      let discount = 0;
      let couponId: string | undefined;
      let couponError: string | undefined;
      if (args.coupon_code) {
        const subtotal = await computeSubtotal(
          supabase,
          ctx.workspaceId,
          args.items,
        );
        const validation = await validateCoupon(
          supabase,
          ctx.workspaceId,
          args.coupon_code,
          subtotal,
        );
        if (validation.ok && validation.coupon) {
          discount = validation.discount ?? 0;
          couponId = validation.coupon.id;
        } else {
          couponError = validation.error;
        }
      }

      const order = await createOrderWithCoupon(supabase, ctx.workspaceId, null, {
        contact_id: ctx.contactId,
        conversation_id: ctx.conversationId,
        source: "chat",
        items: args.items,
        note: args.note,
        channel: "whatsapp",
        discount,
        coupon_id: couponId,
      });

      return {
        ok: true,
        output: {
          order_id: order.id,
          order_number: order.order_number,
          total: order.total,
          total_formatted: `$${Number(order.total).toLocaleString("es-AR")}`,
          discount_applied: discount,
          coupon_error: couponError,
          status: order.status,
          message: couponError
            ? `Orden creada, pero el cupón no se aplicó: ${couponError}. Informa al cliente el total y ofrece forma de pago.`
            : "Orden creada. Informa al cliente el número de orden y el total. Luego ofrece forma de pago.",
        },
      };
    } catch (e: any) {
      if (e.message?.startsWith("out_of_stock")) {
        const parts = e.message.split(":");
        return {
          ok: false,
          output: null,
          error: `Sin stock para "${parts[1] ?? "producto"}". Disponible: ${parts[2] ?? 0} unidades.`,
        };
      }
      return { ok: false, output: null, error: e.message };
    }
  },
};
