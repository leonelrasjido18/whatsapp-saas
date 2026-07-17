import { z } from "zod";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { Tool } from "../core/tool";
import { hasFeature } from "@/features/billing/plans";
import type { PlanTier } from "@/features/billing/plans";

// Pedido recurrente. The customer sets up "the usual, every X days"; a cron
// recreates it and reminds them.

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
        product_id: z.string().uuid(),
        qty: z.number().int().min(1).default(1),
      }),
    )
    .min(1)
    .describe("Productos del pedido recurrente (IDs de catalog_search)."),
  frequency_days: z
    .number()
    .int()
    .min(1)
    .max(365)
    .describe("Cada cuántos días se repite (ej: 30 = mensual)."),
});

export const createRecurringOrderTool: Tool<z.infer<typeof schema>> = {
  name: "create_recurring_order",
  description:
    "Programa un pedido recurrente para el cliente ('mandame lo mismo cada mes'). Cada X días se recrea el pedido y se le avisa. Usar cuando el cliente pide repetir una compra periódicamente.",
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
      const nextRun = new Date(Date.now() + args.frequency_days * 86400000)
        .toISOString()
        .slice(0, 10);

      const { error } = await supabase.from("recurring_orders").insert({
        workspace_id: ctx.workspaceId,
        contact_id: ctx.contactId,
        conversation_id: ctx.conversationId,
        items: args.items,
        frequency_days: args.frequency_days,
        next_run: nextRun,
      });
      if (error) return { ok: false, output: null, error: error.message };

      return {
        ok: true,
        output: {
          message: `Pedido recurrente programado cada ${args.frequency_days} días. El próximo lo preparamos el ${nextRun}.`,
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
