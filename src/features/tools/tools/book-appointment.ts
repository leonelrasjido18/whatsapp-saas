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

  const deposit = result.depositAmount ?? 0;

  // No deposit required → done.
  if (deposit <= 0) {
    return {
      ok: true,
      output: {
        appointment_id: result.appointment.id,
        starts_at: result.appointment.starts_at,
        message: "Turno agendado con éxito.",
      },
    };
  }

  // Deposit required: try to generate a MercadoPago link so the customer can pay
  // the seña to confirm. If MP isn't configured, ask for a transfer instead.
  const money = "$" + Math.round(deposit).toLocaleString("es-AR");
  try {
    const { createClient: createSbClient } = await import("@supabase/supabase-js");
    const { getValidMpAccessToken } = await import(
      "@/features/commerce/services/mercadopago-oauth"
    );
    const { createCheckoutPreference } = await import(
      "@/features/commerce/services/mercadopago"
    );
    const supabase = createSbClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const token = await getValidMpAccessToken(supabase, ctx.workspaceId);
    if (token) {
      // Synthetic single-item "order" just to build the checkout preference for
      // the deposit. The money lands in the merchant's MercadoPago.
      const syntheticOrder = {
        id: result.appointment.id,
        items: [
          {
            id: "sena",
            product_id: null,
            product_name: `Seña - ${result.serviceName ?? "turno"}`,
            unit_price: deposit,
            qty: 1,
          },
        ],
      } as unknown as Parameters<typeof createCheckoutPreference>[1];

      const pref = await createCheckoutPreference(
        token,
        syntheticOrder,
        ctx.workspaceId,
      );
      return {
        ok: true,
        output: {
          appointment_id: result.appointment.id,
          starts_at: result.appointment.starts_at,
          deposit_amount: deposit,
          payment_link: pref.init_point,
          message: `Turno reservado. Para confirmarlo, pedile al cliente que abone la seña de ${money} con este link.`,
        },
      };
    }
  } catch (e) {
    console.error("[book_appointment] deposit link failed:", e);
  }

  // MP not available or link failed → ask for a transfer.
  return {
    ok: true,
    output: {
      appointment_id: result.appointment.id,
      starts_at: result.appointment.starts_at,
      deposit_amount: deposit,
      message: `Turno reservado. Para confirmarlo se requiere una seña de ${money}. Pedile al cliente que la transfiera o la abone.`,
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
