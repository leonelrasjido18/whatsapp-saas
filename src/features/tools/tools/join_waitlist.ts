import { z } from "zod";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { Tool } from "../core/tool";
import { hasFeature } from "@/features/billing/plans";
import type { PlanTier } from "@/features/billing/plans";

// Waitlist. When a product is out of stock, the agent adds the customer so a cron
// notifies them when it's back. Recovers otherwise-lost sales.

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const schema = z.object({
  product_id: z
    .string()
    .uuid()
    .describe("ID del producto sin stock que el cliente quiere (de catalog_search)."),
});

export const joinWaitlistTool: Tool<z.infer<typeof schema>> = {
  name: "join_waitlist",
  description:
    "Anota al cliente para avisarle cuando un producto SIN STOCK vuelva a estar disponible. Usar cuando el cliente quiere algo que está agotado. Confirmale que le vas a avisar cuando llegue.",
  sensitivity: "write",
  schema,
  enabledFor: async (workspaceId) => {
    const { data } = await svc()
      .from("workspaces")
      .select("plan_tier")
      .eq("id", workspaceId)
      .single();
    return hasFeature((data?.plan_tier as PlanTier) ?? "starter", "catalog_sales");
  },
  run: async (args, ctx) => {
    try {
      const supabase = svc();
      const { data: product } = await supabase
        .from("products")
        .select("name")
        .eq("id", args.product_id)
        .eq("workspace_id", ctx.workspaceId)
        .maybeSingle();
      if (!product) {
        return { ok: false, output: null, error: "Producto no encontrado." };
      }

      const { error } = await supabase.from("waitlist").insert({
        workspace_id: ctx.workspaceId,
        contact_id: ctx.contactId,
        product_id: args.product_id,
        conversation_id: ctx.conversationId,
      });
      // Duplicate (already on the list) is fine — treat as success.
      if (error && !error.message.includes("duplicate")) {
        return { ok: false, output: null, error: error.message };
      }

      return {
        ok: true,
        output: {
          message: `Anotado. Le avisaremos cuando "${product.name}" vuelva a haber stock.`,
        },
      };
    } catch (e) {
      return {
        ok: false,
        output: null,
        error: e instanceof Error ? e.message : "error",
      };
    }
  },
};
