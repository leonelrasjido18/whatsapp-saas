import { MercadoPagoConfig, Preference, Payment } from "mercadopago";
import { Order } from "../types";
import { getBaseUrl } from "@/lib/utils";

/**
 * Crea una preferencia de pago de MercadoPago Checkout Pro
 */
export async function createCheckoutPreference(
  accessToken: string,
  order: Order,
  workspaceId: string
) {
  const client = new MercadoPagoConfig({ accessToken });
  const preference = new Preference(client);
  const baseUrl = getBaseUrl();

  const result = await preference.create({
    body: {
      items: order.items?.map(item => ({
        id: item.product_id || item.id,
        title: item.product_name,
        quantity: item.qty,
        unit_price: item.unit_price,
        currency_id: "ARS"
      })) || [],
      back_urls: {
        success: `${baseUrl}/pago/gracias?status=success`,
        pending: `${baseUrl}/pago/gracias?status=pending`,
        failure: `${baseUrl}/pago/gracias?status=failure`
      },
      auto_return: "approved",
      external_reference: order.id,
      metadata: {
        workspace_id: workspaceId,
        order_id: order.id
      },
      notification_url: `${baseUrl}/api/webhooks/commerce-mp?workspace_id=${workspaceId}`
    }
  });

  return result;
}

/**
 * Obtiene la info de un pago para validarlo
 */
export async function getPayment(accessToken: string, paymentId: string | number) {
  const client = new MercadoPagoConfig({ accessToken });
  const payment = new Payment(client);
  return payment.get({ id: paymentId });
}

/**
 * Busca un pago APROBADO para una orden por su external_reference.
 * Usado por el cron de reconciliación cuando el webhook no llegó.
 */
export async function findApprovedPayment(
  accessToken: string,
  orderId: string
): Promise<{ id: string } | null> {
  const client = new MercadoPagoConfig({ accessToken });
  const payment = new Payment(client);
  const res: any = await payment.search({
    options: { external_reference: orderId },
  });
  const results: any[] = res?.results ?? [];
  const approved = results.find((p) => p?.status === "approved");
  return approved ? { id: String(approved.id) } : null;
}
