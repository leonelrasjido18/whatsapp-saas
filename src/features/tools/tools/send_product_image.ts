import { z } from "zod";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { Tool } from "../core/tool";
import { getSignedUrls } from "@/features/commerce/services/product-images";
import { dispatchImage } from "@/features/inbox/services/dispatch";
import { hasFeature } from "@/features/billing/plans";
import type { PlanTier } from "@/features/billing/plans";

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
    .describe("ID del producto (obtenido de catalog_search) cuya foto enviar."),
});

export const sendProductImageTool: Tool<z.infer<typeof schema>> = {
  name: "send_product_image",
  description:
    "Envía por WhatsApp la foto de un producto del catálogo. Usar cuando el cliente pide ver una foto o cuando ayuda a cerrar la venta. Si el producto no tiene foto cargada, avisar al cliente y seguir con la descripción por texto.",
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
        .select("name, price, image_paths")
        .eq("id", args.product_id)
        .eq("workspace_id", ctx.workspaceId)
        .single();

      if (!product) {
        return { ok: false, output: null, error: "Producto no encontrado." };
      }

      const paths = (product.image_paths as string[] | null) ?? [];
      if (paths.length === 0) {
        return {
          ok: true,
          output: {
            sent: false,
            message:
              "El producto no tiene foto cargada. Describilo por texto y seguí con la venta.",
          },
        };
      }

      const [url] = await getSignedUrls(supabase, [paths[0]], 3600);
      if (!url) {
        return {
          ok: true,
          output: { sent: false, message: "No se pudo obtener la foto. Seguí por texto." },
        };
      }

      const caption = `${product.name} — $${Number(product.price).toLocaleString("es-AR")}`;
      const result = await dispatchImage({
        workspaceId: ctx.workspaceId,
        conversationId: ctx.conversationId,
        imageUrl: url,
        caption,
      });

      if (!result.ok) {
        return {
          ok: true,
          output: {
            sent: false,
            message:
              "No se pudo enviar la foto (posible ventana de 24h vencida o canal sin soporte). Seguí por texto.",
          },
        };
      }

      return {
        ok: true,
        output: { sent: true, message: "Foto enviada al cliente." },
      };
    } catch (e: any) {
      return { ok: false, output: null, error: e.message };
    }
  },
};
