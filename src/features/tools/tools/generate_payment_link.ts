import { z } from "zod";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { Tool } from "../core/tool";
import { getOrder } from "@/features/commerce/services/orders";
import { createCheckoutPreference } from "@/features/commerce/services/mercadopago";
import { hasFeature } from "@/features/billing/plans";
import type { PlanTier } from "@/features/billing/plans";

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const schema = z.object({
  order_id: z.string().uuid().describe("ID de la orden a cobrar (obtenido de create_order)"),
});

export const generatePaymentLinkTool: Tool<z.infer<typeof schema>> = {
  name: "generate_payment_link",
  description:
    "Genera un link de Checkout Pro de MercadoPago para cobrar una orden. Usar si el cliente quiere pagar con tarjeta o digitalmente. Si falla porque el comercio no tiene MP configurado, ofrecer efectivo o transferencia sin inventar links.",
  sensitivity: "write",
  schema,
  enabledFor: async (workspaceId) => {
    // Needs both: plan feature AND mp_access_token configured
    const supabase = svc();
    const { data: wsData } = await supabase
      .from("workspaces")
      .select("plan_tier")
      .eq("id", workspaceId)
      .single();

    const { data: integration } = await supabase
      .from("integrations")
      .select("credentials")
      .eq("workspace_id", workspaceId)
      .eq("provider", "mercadopago")
      .single();

    if (!integration?.credentials?.mp_access_token) return false;
    return hasFeature((wsData?.plan_tier as PlanTier) ?? "starter", "merchant_payments");
  },
  run: async (args, ctx) => {
    try {
      const supabase = svc();

      const { data: integration } = await supabase
        .from("integrations")
        .select("credentials")
        .eq("workspace_id", ctx.workspaceId)
        .eq("provider", "mercadopago")
        .single();

      const mp_access_token = integration?.credentials?.mp_access_token;

      if (!mp_access_token) {
        return {
          ok: false,
          output: null,
          error:
            "El comercio no tiene MercadoPago configurado. Ofrecé efectivo o transferencia bancaria.",
        };
      }

      const order = await getOrder(supabase, ctx.workspaceId, args.order_id);

      if (!order) {
        return { ok: false, output: null, error: "Orden no encontrada." };
      }

      // SEC: validate the order belongs to the current contact
      if (order.contact_id !== ctx.contactId) {
        return { ok: false, output: null, error: "La orden no pertenece a este contacto." };
      }

      if (order.status !== "pending") {
        return {
          ok: false,
          output: null,
          error: `La orden ya no está pendiente. Estado actual: ${order.status}`,
        };
      }

      const preference = await createCheckoutPreference(
        String(mp_access_token),
        order,
        ctx.workspaceId
      );

      return {
        ok: true,
        output: {
          payment_link: preference.init_point,
          message:
            "Envía este link al cliente para que realice el pago. La orden se confirmará automáticamente al completar el pago.",
        },
      };
    } catch (e: any) {
      return { ok: false, output: null, error: e.message };
    }
  },
};
