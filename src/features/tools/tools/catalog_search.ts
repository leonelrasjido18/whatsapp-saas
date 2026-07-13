import { z } from "zod";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { Tool } from "../core/tool";
import { getProducts } from "@/features/commerce/services/catalog";
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
  query: z.string().optional().describe(
    "Término de búsqueda (ej. 'remera', 'pizza'). Vacío para listar los principales productos activos."
  ),
});

export const catalogSearchTool: Tool<z.infer<typeof schema>> = {
  name: "catalog_search",
  description:
    "OBLIGATORIO usarla antes de mencionar cualquier precio, producto o servicio. Busca en el catálogo real del comercio con precios y stock actualizados. NUNCA inventes precios, productos ni promociones que no aparezcan en los resultados. Si el stock de un producto es 0 o 'sin_stock', dile al cliente que está agotado sin ofrecer alternativas inexistentes.",
  sensitivity: "read",
  schema,
  enabledFor: async (workspaceId) => {
    const tier = await getWorkspaceTier(workspaceId);
    return hasFeature(tier, "catalog_sales");
  },
  run: async (args, ctx) => {
    try {
      const supabase = svc();
      const products = await getProducts(supabase, ctx.workspaceId);

      const activeProducts = products.filter((p) => p.is_active);
      let results = activeProducts;

      if (args.query) {
        const q = args.query.toLowerCase();
        results = activeProducts.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.description?.toLowerCase().includes(q) ||
            p.sku?.toLowerCase().includes(q)
        );
      }

      const limit = 20;
      const sliced = results.slice(0, limit);

      const items = sliced.map((p) => {
        const stock = p.type === "product" ? (p.stock_qty ?? 0) : null;
        let availability: "disponible" | "pocas_unidades" | "sin_stock" | "servicio";
        if (p.type === "service") {
          availability = "servicio";
        } else if (stock === 0) {
          availability = "sin_stock";
        } else if (stock !== null && stock <= p.low_stock_threshold) {
          availability = "pocas_unidades";
        } else {
          availability = "disponible";
        }

        return {
          id: p.id,
          name: p.name,
          type: p.type === "product" ? "Producto Físico" : "Servicio",
          price: p.price,
          price_formatted: `$${p.price.toLocaleString("es-AR")}`,
          stock,
          availability,
          description: p.description,
        };
      });

      return {
        ok: true,
        output: {
          total_found: results.length,
          showing: items.length,
          items,
        },
      };
    } catch (e: any) {
      return { ok: false, output: null, error: e.message };
    }
  },
};
