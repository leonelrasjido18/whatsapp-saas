import { z } from "zod";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { Tool } from "../core/tool";

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const schema = z.object({
  order_number: z.number().int().positive().optional().describe(
    "Número de orden (ej: 42). Si no se indica, se devuelven las últimas 3 órdenes del contacto."
  ),
});

export const getOrderStatusTool: Tool<z.infer<typeof schema>> = {
  name: "get_order_status",
  description:
    "Consulta el estado de un pedido del cliente. IMPORTANTE: solo retorna órdenes del contacto actual — nunca de otros clientes. Usar cuando el cliente pregunte por su pedido.",
  sensitivity: "read",
  schema,
  enabledFor: async () => true,
  run: async (args, ctx) => {
    try {
      const supabase = svc();

      let query = supabase
        .from("orders")
        .select(`
          id, order_number, status, total, source, channel,
          payment_method, created_at, paid_at,
          items:order_items(product_name, qty, unit_price, line_total)
        `)
        .eq("workspace_id", ctx.workspaceId)
        .eq("contact_id", ctx.contactId) // SEC: scoped to current contact
        .order("created_at", { ascending: false });

      if (args.order_number) {
        query = query.eq("order_number", args.order_number);
      } else {
        query = query.limit(3);
      }

      const { data: orders, error } = await query;
      if (error) throw error;

      if (!orders || orders.length === 0) {
        return {
          ok: true,
          output: {
            found: false,
            message: "No se encontraron pedidos para este contacto.",
          },
        };
      }

      const STATUS_LABELS: Record<string, string> = {
        pending: "Pendiente de pago",
        paid: "Pagado ✅",
        cancelled: "Cancelado ❌",
        refunded: "Reembolsado",
      };

      return {
        ok: true,
        output: {
          found: true,
          orders: orders.map((o) => ({
            order_number: o.order_number,
            status: STATUS_LABELS[o.status] ?? o.status,
            total: o.total,
            payment_method: o.payment_method,
            created_at: o.created_at,
            paid_at: o.paid_at,
            items: o.items,
          })),
        },
      };
    } catch (e: any) {
      return { ok: false, output: null, error: e.message };
    }
  },
};
