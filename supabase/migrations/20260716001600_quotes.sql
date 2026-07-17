-- Presupuestos / cotizaciones. El agente arma un presupuesto con ítems libres y
-- comparte un link público con el detalle. Útil para servicios ("te paso el
-- presupuesto formal").

CREATE TABLE IF NOT EXISTS public.quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  public_token UUID NOT NULL DEFAULT gen_random_uuid(),
  items JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{description, unit_price, qty}]
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','accepted','rejected','expired')),
  valid_until DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_quotes_token ON public.quotes(public_token);
CREATE INDEX IF NOT EXISTS idx_quotes_workspace ON public.quotes(workspace_id, created_at DESC);

ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws members read quotes" ON public.quotes
  FOR SELECT USING (workspace_id IN (SELECT auth_workspace_ids()));
-- Created by the agent tool (service role); public page reads by token (service role).
