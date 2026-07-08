/**
 * Billing and subscription types
 */

export type PlanTier = 'starter' | 'pro' | 'enterprise';
export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'suspended';
export type PaymentMethod = 'mercadopago' | 'manual';
export type PaymentStatus = 'pending' | 'approved' | 'rejected';

export interface Payment {
  id: string;
  workspace_id: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  status: PaymentStatus;
  mercadopago_payment_id: string | null;
  recorded_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceBilling {
  plan_tier: PlanTier;
  subscription_status: SubscriptionStatus;
  mercadopago_subscription_id: string | null;
  billing_notes: string | null;
}
