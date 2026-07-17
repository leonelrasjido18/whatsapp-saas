// agency-billing.ts — #12 recurring billing. Creates a MercadoPago Preapproval
// (subscription) so the agency debits the monthly maintenance fee automatically.
// Uses the AGENCY's own MercadoPago access token from env (MP_AGENCY_ACCESS_TOKEN)
// — this is platform-level, not the client's merchant token.
//
// REQUISITO: setear MP_AGENCY_ACCESS_TOKEN (token de la cuenta MP de la agencia).
// El cliente aprueba la suscripción una vez desde el link; luego se debita solo.

import { MercadoPagoConfig, PreApproval } from "mercadopago";
import { getBaseUrl } from "@/lib/utils";

export function isAgencyBillingConfigured(): boolean {
  return Boolean(process.env.MP_AGENCY_ACCESS_TOKEN);
}

export interface PreapprovalResult {
  id: string;
  initPoint: string;
}

/**
 * Creates a monthly Preapproval for `amount` ARS and returns the link the client
 * approves. Throws when the agency MP token isn't configured.
 */
export async function createAgencyPreapproval(opts: {
  amount: number;
  payerEmail: string;
  reason?: string;
}): Promise<PreapprovalResult> {
  const token = process.env.MP_AGENCY_ACCESS_TOKEN;
  if (!token) {
    throw new Error("MP_AGENCY_ACCESS_TOKEN no está configurado.");
  }

  const client = new MercadoPagoConfig({ accessToken: token });
  const preapproval = new PreApproval(client);

  const result = await preapproval.create({
    body: {
      reason: opts.reason ?? "Mantenimiento mensual — Agente WhatsApp",
      payer_email: opts.payerEmail,
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: opts.amount,
        currency_id: "ARS",
      },
      back_url: `${getBaseUrl()}/workspaces`,
      status: "pending",
    },
  });

  const id = String(result.id ?? "");
  const initPoint = String(result.init_point ?? "");
  if (!id || !initPoint) {
    throw new Error("MercadoPago no devolvió el link de suscripción.");
  }
  return { id, initPoint };
}
