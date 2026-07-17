import { z } from "zod";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { Tool } from "../core/tool";
import { getBaseUrl } from "@/lib/utils";

// Presupuestos. The agent builds a quote from free-form line items and gets a
// shareable public link to send the customer.

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const schema = z.object({
  items: z
    .array(
      z.object({
        description: z.string().min(1).describe("Descripción del ítem"),
        unit_price: z.number().min(0).describe("Precio unitario"),
        qty: z.number().int().min(1).default(1).describe("Cantidad"),
      }),
    )
    .min(1)
    .describe("Ítems del presupuesto"),
  note: z.string().optional().describe("Nota o condiciones (opcional)"),
  valid_days: z
    .number()
    .int()
    .min(1)
    .max(90)
    .optional()
    .describe("Días de validez del presupuesto (opcional)"),
});

export const createQuoteTool: Tool<z.infer<typeof schema>> = {
  name: "create_quote",
  description:
    "Crea un presupuesto/cotización formal con ítems y precios, y devuelve un link para compartir con el cliente. Usar cuando el cliente pide un presupuesto por escrito. Confirmá los ítems y precios antes de crearlo.",
  sensitivity: "write",
  schema,
  enabledFor: () => true,
  run: async (args, ctx) => {
    try {
      const supabase = svc();
      const total = args.items.reduce(
        (sum, it) => sum + it.unit_price * it.qty,
        0,
      );
      const validUntil = args.valid_days
        ? new Date(Date.now() + args.valid_days * 86400000)
            .toISOString()
            .slice(0, 10)
        : null;

      const { data, error } = await supabase
        .from("quotes")
        .insert({
          workspace_id: ctx.workspaceId,
          contact_id: ctx.contactId,
          conversation_id: ctx.conversationId,
          items: args.items,
          total,
          note: args.note ?? null,
          valid_until: validUntil,
        })
        .select("public_token")
        .single();

      if (error || !data) {
        return { ok: false, output: null, error: error?.message ?? "No se pudo crear" };
      }

      const link = `${getBaseUrl()}/presupuesto/${data.public_token}`;
      return {
        ok: true,
        output: {
          quote_link: link,
          total,
          message: `Presupuesto creado por $${Math.round(total).toLocaleString("es-AR")}. Compartí este link con el cliente: ${link}`,
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
