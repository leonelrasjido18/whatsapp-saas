import { z } from "zod";
import type { Tool, ToolContext, ToolResult } from "../core/tool";

const schema = z.object({
  appointment_id: z
    .string()
    .optional()
    .describe(
      "ID del turno a cancelar. Si falta, se listan los próximos turnos del contacto.",
    ),
});

type Args = z.infer<typeof schema>;

async function run(args: Args, ctx: ToolContext): Promise<ToolResult> {
  const { cancelAppointment, listUpcomingForContact } = await import(
    "../../booking/services/booking"
  );

  // Without an id, return the contact's upcoming appointments so the agent can
  // ask which one to cancel.
  if (!args.appointment_id) {
    const upcoming = await listUpcomingForContact(
      ctx.workspaceId,
      ctx.contactId,
    );
    return {
      ok: true,
      output: {
        upcoming: upcoming.map((a) => ({
          appointment_id: a.id,
          starts_at: a.starts_at,
        })),
        message:
          upcoming.length === 0
            ? "El cliente no tiene turnos próximos."
            : "Estos son los próximos turnos del cliente. Pedí cuál cancelar.",
      },
    };
  }

  const ok = await cancelAppointment(ctx.workspaceId, args.appointment_id);
  if (!ok) {
    return {
      ok: false,
      output: null,
      error: "No se pudo cancelar (¿ya estaba cancelado o no existe?)",
    };
  }
  return { ok: true, output: { message: "Turno cancelado." } };
}

export const cancelAppointmentTool: Tool<Args> = {
  name: "cancel_appointment",
  description:
    "Cancela un turno existente del cliente. Si no se especifica cuál, lista los próximos turnos del contacto.",
  sensitivity: "write",
  schema,
  enabledFor: () => true,
  run,
};
