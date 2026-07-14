import { z } from "zod";
import type { Tool, ToolContext, ToolResult } from "../core/tool";

const schema = z.object({
  starts_at: z
    .string()
    .describe("Inicio del turno en ISO con offset (ej: 2026-07-15T10:00:00-03:00)"),
  service_id: z.string().optional().describe("ID del servicio (opcional)"),
  customer_name: z
    .string()
    .optional()
    .describe("Nombre del cliente para el turno"),
  note: z.string().optional(),
});

type Args = z.infer<typeof schema>;

async function run(args: Args, ctx: ToolContext): Promise<ToolResult> {
  const { createAppointment } = await import("../../booking/services/booking");

  const result = await createAppointment({
    workspaceId: ctx.workspaceId,
    contactId: ctx.contactId,
    conversationId: ctx.conversationId,
    serviceId: args.service_id ?? null,
    startsAt: args.starts_at,
    customerName: args.customer_name ?? null,
    note: args.note ?? null,
    createdBy: null, // IA
  });

  if (!result.ok || !result.appointment) {
    return { ok: false, output: null, error: result.error ?? "No se pudo agendar" };
  }

  return {
    ok: true,
    output: {
      appointment_id: result.appointment.id,
      starts_at: result.appointment.starts_at,
      message: "Turno agendado con éxito.",
    },
  };
}

export const bookAppointmentTool: Tool<Args> = {
  name: "book_appointment",
  description:
    "Reserva un turno para el cliente en un horario disponible. Usar SOLO cuando el cliente confirme fecha y hora.",
  sensitivity: "write",
  schema,
  enabledFor: () => true,
  run,
};
