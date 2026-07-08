import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSbClient } from '@supabase/supabase-js';
import { getMercadoPagoClient } from '@/features/billing/services/mercadopago-client';

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * Webhook for MercadoPago subscription and payment notifications
 * POST /api/webhooks/mercadopago
 *
 * MercadoPago sends notifications for:
 * - payment.created / payment.updated — Payment status changes
 * - preapproval_created / preapproval_updated — Subscription status changes
 *
 * Payload example:
 * {
 *   id: "123456789",
 *   topic: "payment" or "preapproval",
 *   resource: "https://api.mercadopago.com/v1/payment/123456789",
 *   data: { id: "123456789" },
 *   action: "payment.created"
 * }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.text();
    const signature = request.headers.get('x-signature');
    const webhookSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error('[mercadopago-webhook] MERCADOPAGO_WEBHOOK_SECRET not set');
      return NextResponse.json(
        { error: 'Webhook not configured' },
        { status: 500 },
      );
    }

    // Verify signature
    const mp = getMercadoPagoClient();
    if (!mp.verifyWebhookSignature(body, signature, webhookSecret)) {
      console.warn('[mercadopago-webhook] Invalid signature');
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 },
      );
    }

    // Parse payload
    const payload = JSON.parse(body);
    const { topic, resourceId } = mp.parseWebhook(payload);

    console.log(
      `[mercadopago-webhook] Received ${topic} notification for resource ${resourceId}`,
    );

    // Handle topic-specific logic
    if (topic === 'preapproval' || topic === 'preapproval_plan') {
      await handlePreapprovalNotification(resourceId);
    } else if (topic === 'payment') {
      await handlePaymentNotification(resourceId);
    } else {
      console.warn(
        `[mercadopago-webhook] Unknown topic: ${topic}, ignoring`,
      );
    }

    // Always return 200 so MercadoPago doesn't retry
    return NextResponse.json({ status: 'ok' }, { status: 200 });
  } catch (err) {
    console.error('[mercadopago-webhook] Error:', err);
    // Return 200 even on error (MercadoPago expects it) to avoid retries
    return NextResponse.json(
      { error: 'Processing error', details: String(err) },
      { status: 200 },
    );
  }
}

/**
 * Handle preapproval (subscription) notifications
 * States: active, paused, suspended, closed, cancelled
 */
async function handlePreapprovalNotification(preapprovalId: string) {
  try {
    // Fetch preapproval status from MercadoPago
    const mp = getMercadoPagoClient();
    const preapproval = await mp.getPreapprovalStatus(preapprovalId);

    if (!preapproval.external_reference) {
      console.warn(
        `[mercadopago-webhook] Preapproval ${preapprovalId} has no external_reference`,
      );
      return;
    }

    const workspaceId = preapproval.external_reference;

    // Map MercadoPago preapproval status to our subscription_status
    let subscriptionStatus = 'trial';
    if (preapproval.status === 'active') {
      subscriptionStatus = 'active';
    } else if (
      preapproval.status === 'paused' ||
      preapproval.status === 'suspended'
    ) {
      subscriptionStatus = 'past_due';
    } else if (
      preapproval.status === 'closed' ||
      preapproval.status === 'cancelled'
    ) {
      subscriptionStatus = 'suspended';
    }

    // Update workspace subscription status
    const { error } = await svc()
      .from('workspaces')
      .update({ subscription_status: subscriptionStatus })
      .eq('id', workspaceId);

    if (error) {
      console.error(
        `[mercadopago-webhook] Failed to update workspace ${workspaceId}:`,
        error,
      );
    } else {
      console.log(
        `[mercadopago-webhook] Updated workspace ${workspaceId} subscription_status to ${subscriptionStatus}`,
      );
    }
  } catch (err) {
    console.error('[mercadopago-webhook] handlePreapprovalNotification error:', err);
  }
}

/**
 * Handle payment notifications
 * This is called for charges within a subscription
 * Status: pending, approved, rejected, cancelled
 */
async function handlePaymentNotification(paymentId: string) {
  try {
    // Fetch payment details from MercadoPago API
    const response = await fetch(
      `https://api.mercadopago.com/v1/payments/${paymentId}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}`,
        },
      },
    );

    if (!response.ok) {
      console.error(
        `[mercadopago-webhook] Failed to fetch payment ${paymentId}: ${response.statusText}`,
      );
      return;
    }

    const payment = await response.json();

    // Find which workspace this payment belongs to
    // Payments linked to preapprovals have a subscription_id or additional_info.external_reference
    const workspaceId =
      payment.additional_info?.external_reference || payment.external_reference;

    if (!workspaceId) {
      console.warn(
        `[mercadopago-webhook] Payment ${paymentId} has no external_reference`,
      );
      return;
    }

    // Map payment status to our payment_status
    let paymentStatus = 'pending';
    if (payment.status === 'approved') {
      paymentStatus = 'approved';
    } else if (payment.status === 'rejected') {
      paymentStatus = 'rejected';
    }

    // Record payment in our database
    const { error } = await svc()
      .from('payments')
      .insert({
        workspace_id: workspaceId,
        amount: payment.transaction_amount || 0,
        currency: payment.currency_id || 'ARS',
        method: 'mercadopago',
        status: paymentStatus,
        mercadopago_payment_id: paymentId,
      });

    if (error) {
      console.error(
        `[mercadopago-webhook] Failed to insert payment ${paymentId}:`,
        error,
      );
    } else {
      console.log(
        `[mercadopago-webhook] Recorded payment ${paymentId} (${paymentStatus}) for workspace ${workspaceId}`,
      );

      // If approved, ensure subscription_status is active
      if (paymentStatus === 'approved') {
        await svc()
          .from('workspaces')
          .update({ subscription_status: 'active' })
          .eq('id', workspaceId);
      }
    }
  } catch (err) {
    console.error('[mercadopago-webhook] handlePaymentNotification error:', err);
  }
}
