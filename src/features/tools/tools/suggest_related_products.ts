import { z } from "zod";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { Tool } from "../core/tool";
import { hasFeature } from "@/features/billing/plans";
import type { PlanTier } from "@/features/billing/plans";

// Upsell / cross-sell. Given a product the customer is interested in, returns
// other active products (same category first) so the agent can suggest a
// complement or a higher-value option and lift the ticket.

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
    .describe("ID del producto que le interesa al cliente (de catalog_search)."),
});

export const suggestRelatedProductsTool: Tool<z.infer<typeof schema>> = {
  name: "suggest_related_products",
  description:
    "Devuelve productos relacionados para sugerir junto a lo que el cliente quiere (venta cruzada / upsell). Usar tras confirmar interés en un producto, para ofrecer un complemento o una opción superior. No insistas: sugerí 1 o 2 como mucho.",
  sensitivity: "read",
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

      const { data: base } = await supabase
        .from("products")
        .select("id, category_id")
        .eq("id", args.product_id)
        .eq("workspace_id", ctx.workspaceId)
        .maybeSingle();

      if (!base) {
        return { ok: false, output: null, error: "Producto no encontrado." };
      }

      // Prefer same-category products; fall back to any active product.
      let query = supabase
        .from("products")
        .select("id, name, price, description")
        .eq("workspace_id", ctx.workspaceId)
        .eq("is_active", true)
        .neq("id", args.product_id)
        .limit(4);

      if (base.category_id) {
        query = query.eq("category_id", base.category_id);
      }

      const { data: related } = await query;

      let items = related ?? [];
      // If the category had nothing, widen to any other product.
      if (items.length === 0 && base.category_id) {
        const { data: any } = await supabase
          .from("products")
          .select("id, name, price, description")
          .eq("workspace_id", ctx.workspaceId)
          .eq("is_active", true)
          .neq("id", args.product_id)
          .limit(3);
        items = any ?? [];
      }

      return {
        ok: true,
        output: {
          related: items.map((p) => ({
            id: p.id,
            name: p.name,
            price: Number(p.price ?? 0),
            description: p.description,
          })),
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
