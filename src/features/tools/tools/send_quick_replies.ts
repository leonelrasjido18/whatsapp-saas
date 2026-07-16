import { z } from "zod";
import { Tool } from "../core/tool";
import { dispatchInteractiveButtons } from "@/features/inbox/services/dispatch";

// #4 Interactive messages. Lets the agent offer tappable buttons instead of
// asking the customer to type. Great for yes/no, choosing between 2–3 options,
// or a clear call to action. WhatsApp allows at most 3 buttons and only inside
// the 24h window (dispatch falls back to numbered text otherwise).

const schema = z.object({
  body: z
    .string()
    .min(1)
    .max(1024)
    .describe("El texto/pregunta que acompaña a los botones."),
  buttons: z
    .array(z.string().min(1).max(20))
    .min(1)
    .max(3)
    .describe(
      "Entre 1 y 3 opciones tappeables. Cada una máximo 20 caracteres (WhatsApp corta más largo).",
    ),
});

export const sendQuickRepliesTool: Tool<z.infer<typeof schema>> = {
  name: "send_quick_replies",
  description:
    "Envía un mensaje de WhatsApp con botones tappeables (máximo 3). Usalo para preguntas de sí/no, elegir entre pocas opciones, o un llamado a la acción claro. Cuando el cliente toca un botón, su elección llega como si la hubiera escrito.",
  sensitivity: "write",
  schema,
  // Purely a presentation helper — available wherever the agent can send text.
  enabledFor: () => true,
  run: async (args, ctx) => {
    try {
      const buttons = args.buttons.map((title, i) => ({
        id: `qr_${i}`,
        title,
      }));

      const result = await dispatchInteractiveButtons({
        workspaceId: ctx.workspaceId,
        conversationId: ctx.conversationId,
        body: args.body,
        buttons,
      });

      if (!result.ok) {
        return {
          ok: true,
          output: {
            sent: false,
            message:
              "No se pudieron enviar los botones (ventana de 24h vencida). Reformulá la pregunta por texto.",
          },
        };
      }
      return { ok: true, output: { sent: true, message: "Botones enviados." } };
    } catch (e) {
      return {
        ok: false,
        output: null,
        error: e instanceof Error ? e.message : "error",
      };
    }
  },
};
