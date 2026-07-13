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
        success: `${baseUrl}/inbox`,
        pending: `${baseUrl}/inbox`,
        failure: `${baseUrl}/inbox`
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
