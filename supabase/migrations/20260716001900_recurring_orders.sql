-- Pedido recurrente del cliente ("mandame lo mismo cada mes"). Un cron crea la
-- orden cuando corresponde y le avisa al cliente para que confirme/pague.

CREATE TABLE IF NOT EXISTS public.recurring_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{product_id, qty}]
  frequency_days INTEGER NOT NULL CHECK (frequency_days BETWEEN 1 AND 365),
  next_run DATE NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recurring_due
  ON public.recurring_orders(next_run)
  WHERE active;

ALTER TABLE public.recurring_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws members read recurring_orders" ON public.recurring_orders
  FOR SELECT USING (workspace_id IN (SELECT auth_workspace_ids()));
-- Created by the agent tool + advanced by the cron (service role).
