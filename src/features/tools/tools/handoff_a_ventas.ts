import { z } from "zod";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { Tool } from "../core/tool";

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const schema = z.object({
  reason: z
    .string()
    .optional()
    .describe(
      "Motivo breve del pase (ej. 'quiere comprar el producto X', 'pidió precio y confirmó interés').",
    ),
});

/**
 * Handoff del Calificador al Agente de Ventas. Mueve la conversación a la etapa
 * 'soporte' (Ventas); a partir del próximo mensaje responde el prompt de Ventas
 * con las tools de cobro habilitadas. Solo se expone en la etapa Calificador.
 */
export const handoffAVentasTool: Tool<z.infer<typeof schema>> = {
  name: "handoff_a_ventas",
  description:
    "Pasá la conversación al Agente de Ventas cuando el prospecto muestra intención de compra clara (quiere comprar, pide precio para cerrar, confirma interés). Después de llamarla, el equipo de ventas continúa la conversación.",
  sensitivity: "write",
  schema,
  enabledFor: async () => true,
  run: async (args, ctx) => {
    try {
      const supabase = svc();

      const { error } = await supabase
        .from("conversations")
        .update({ pipeline_stage: "soporte" })
        .eq("id", ctx.conversationId)
        .eq("workspace_id", ctx.workspaceId);

      if (error) {
        return { ok: false, output: null, error: error.message };
      }

      // Log the stage transition (best-effort — never blocks the handoff).
      await supabase
        .from("events")
        .insert({
          workspace_id: ctx.workspaceId,
          conversation_id: ctx.conversationId,
          type: "pipeline_stage_changed",
          payload: { to: "soporte", from: "setter", reason: args.reason ?? null },
        })
        .then(
          () => {},
          () => {},
        );

      return {
        ok: true,
        output: {
          stage: "ventas",
          message:
            "Conversación movida a Ventas. Continuá guiando al cliente hacia la compra: buscá en el catálogo, armá el pedido y ofrecé el link de pago.",
        },
      };
    } catch (e: any) {
      return { ok: false, output: null, error: e.message };
    }
  },
};
