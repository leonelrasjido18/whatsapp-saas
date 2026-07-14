import { z } from "zod";
import type { Tool, ToolContext, ToolResult } from "../core/tool";

const schema = z.object({
  date_from: z.string().describe("Fecha inicial ISO (ej: 2026-07-15)"),
  date_to: z.string().describe("Fecha final ISO (ej: 2026-07-20)"),
  service_id: z
    .string()
    .optional()
    .describe("ID del servicio a agendar (opcional, ajusta la duración)"),
});

type Args = z.infer<typeof schema>;

async function run(args: Args, ctx: ToolContext): Promise<ToolResult> {
  const { computeAvailability, listServices } = await import(
    "../../booking/services/booking"
  );

  const from = new Date(args.date_from);
  const to = new Date(args.date_to);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return { ok: false, output: null, error: "Fechas inválidas" };
  }
  // Make date_to inclusive through end of day.
  to.setUTCHours(23, 59, 59, 999);

  let durationMin = 30;
  if (args.service_id) {
    const services = await listServices(ctx.workspaceId);
    const svc = services.find((s) => s.id === args.service_id);
    if (svc) durationMin = svc.duration_min;
  }

  const slots = await computeAvailability(
    ctx.workspaceId,
    from,
    to,
    durationMin,
  );

  return {
    ok: true,
    output: {
      slots,
      count: slots.length,
      message:
        slots.length === 0
          ? "No hay horarios disponibles en ese rango."
          : `Hay ${slots.length} horarios disponibles.`,
    },
  };
}

export const checkAvailabilityNativeTool: Tool<Args> = {
  name: "check_availability_native",
  description:
    "Consulta los horarios libres reales para dar turno, según los horarios de atención del negocio y los turnos ocupados. Úsala ANTES de agendar.",
  sensitivity: "read",
  schema,
  enabledFor: () => true,
  run,
};
