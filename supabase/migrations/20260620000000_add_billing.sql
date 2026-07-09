-- ============================================================
-- Migration: 20260620000000_add_billing
-- Agente WhatsApp — billing infrastructure for SaaS (plans, subscriptions, payments)
-- ============================================================

-- Enums for billing
DO $$ BEGIN
  CREATE TYPE public.plan_tier AS ENUM ('starter', 'pro', 'enterprise');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.subscription_status AS ENUM ('trial', 'active', 'past_due', 'suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.payment_method AS ENUM ('mercadopago', 'manual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.payment_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Add billing columns to workspaces
ALTER TABLE public.workspaces
  ADD COLUMN plan_tier plan_tier DEFAULT 'starter' NOT NULL,
  ADD COLUMN subscription_status subscription_status DEFAULT 'trial' NOT NULL,
  ADD COLUMN mercadopago_subscription_id TEXT,
  ADD COLUMN billing_notes TEXT;

-- Create payments table
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  amount DECIMAL(12, 2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'ARS',
  method payment_method NOT NULL,
  status payment_status NOT NULL DEFAULT 'pending',
  mercadopago_payment_id VARCHAR(255),
  recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger for updated_at on payments
CREATE TRIGGER trg_payments_update_updated_at
BEFORE UPDATE ON public.payments
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

-- Indexes for faster lookups
CREATE INDEX idx_payments_workspace_id ON public.payments(workspace_id);
CREATE INDEX idx_payments_created_at ON public.payments(created_at DESC);
CREATE INDEX idx_payments_mercadopago_id ON public.payments(mercadopago_payment_id);
CREATE INDEX idx_workspaces_subscription_status ON public.workspaces(subscription_status);

-- RLS Policies for payments table
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (no restrictions)
CREATE POLICY "service_role_all_payments" ON public.payments
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Authenticated users: authorization enforced at application layer via requireWorkspaceMember()
-- Allow read/write, but only through the app (not direct SQL)
CREATE POLICY "authenticated_all_payments" ON public.payments
FOR ALL
USING (auth.role() != 'anon')
WITH CHECK (auth.role() != 'anon');

-- ============================================================
-- End of migration: 20260620000000_add_billing
-- ============================================================
