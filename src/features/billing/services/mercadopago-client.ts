/**
 * MercadoPago client wrapper
 * Handles subscription (Preapproval) creation and webhook signature verification
 */

import { createHmac } from 'crypto';

// MercadoPago SDK types (unofficial, typed manually)
interface MercadoPagoConfig {
  accessToken: string;
}

interface PreapprovalRequest {
  payer_email: string;
  back_url: string;
  reason: string;
  external_reference: string;
  auto_recurring: {
    frequency: number;
    frequency_type: 'months' | 'days';
    transaction_amount: number;
    currency_id: string;
    start_date: string;
    end_date?: string;
  };
}

interface PreapprovalResponse {
  id: string;
  payer_id?: string;
  payer_email?: string;
  back_url?: string;
  reason?: string;
  external_reference?: string;
  status?: string;
  init_point?: string; // URL to send the user to approve
}

interface WebhookBody {
  id: string;
  topic: string;
  resource: string;
  action: string;
  data?: {
    id: string;
  };
}

export class MercadoPagoClient {
  private accessToken: string;
  private apiBaseUrl = 'https://api.mercadopago.com/v1';

  constructor(config: MercadoPagoConfig) {
    this.accessToken = config.accessToken;
  }

  /**
   * Create a subscription link (Preapproval) for a workspace
   * User is redirected to this link to approve the subscription
   */
  async createPreapprovalLink(
    workspaceId: string,
    workspaceName: string,
    amount: number,
    payerEmail: string,
    backUrl: string,
  ): Promise<{ init_point: string; preapproval_id: string }> {
    const payload: PreapprovalRequest = {
      payer_email: payerEmail,
      back_url: backUrl,
      reason: `Suscripción WhatsApp Inbox - ${workspaceName}`,
      external_reference: workspaceId,
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: amount,
        currency_id: 'ARS',
        start_date: new Date().toISOString(),
      },
    };

    const response = await fetch(`${this.apiBaseUrl}/preapproval`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(
        `MercadoPago preapproval creation failed: ${error.message || response.statusText}`,
      );
    }

    const data = (await response.json()) as PreapprovalResponse;

    return {
      init_point: data.init_point || '',
      preapproval_id: data.id || '',
    };
  }

  /**
   * Get subscription status (for verification/polling)
   */
  async getPreapprovalStatus(preapprovalId: string): Promise<PreapprovalResponse> {
    const response = await fetch(`${this.apiBaseUrl}/preapproval/${preapprovalId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get preapproval status: ${response.statusText}`);
    }

    return (await response.json()) as PreapprovalResponse;
  }

  /**
   * Verify webhook signature
   * MercadoPago sends: X-Signature header with format "timestamp=ts,v1=signature"
   */
  verifyWebhookSignature(
    body: string,
    signature: string | null,
    webhookSecret: string,
  ): boolean {
    if (!signature) return false;

    // Parse signature: "timestamp=ts,v1=sig"
    const parts = signature.split(',');
    const timestampPart = parts.find(p => p.startsWith('timestamp='));
    const signaturePart = parts.find(p => p.startsWith('v1='));

    if (!timestampPart || !signaturePart) return false;

    const timestamp = timestampPart.replace('timestamp=', '');
    const receivedSig = signaturePart.replace('v1=', '');

    // Compute HMAC-SHA256 of "timestamp.{body}"
    const data = `${timestamp}.${body}`;
    const computed = createHmac('sha256', webhookSecret)
      .update(data)
      .digest('hex');

    // Compare constant-time to avoid timing attacks
    return computed === receivedSig;
  }

  /**
   * Parse webhook payload and return topic (payment.created, payment.updated, etc.)
   */
  parseWebhook(body: WebhookBody): { topic: string; resourceId: string } {
    return {
      topic: body.topic,
      resourceId: body.data?.id || body.id,
    };
  }
}

/**
 * Singleton instance (lazy-loaded)
 */
let client: MercadoPagoClient | null = null;

export function getMercadoPagoClient(): MercadoPagoClient {
  if (!client) {
    const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!token) {
      throw new Error('MERCADOPAGO_ACCESS_TOKEN not set');
    }
    client = new MercadoPagoClient({ accessToken: token });
  }
  return client;
}
