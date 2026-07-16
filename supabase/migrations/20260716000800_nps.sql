-- NPS post-compra. A cron asks paying customers "del 0 al 10, ¿nos recomendarías?"
-- and a collector cron reads their numeric reply. Stored per order so it's not
-- asked twice.

CREATE TABLE IF NOT EXISTS public.nps_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  score INTEGER CHECK (score BETWEEN 0 AND 10),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  UNIQUE (order_id)
);

CREATE INDEX IF NOT EXISTS idx_nps_workspace ON public.nps_responses(workspace_id, requested_at DESC);
-- The collector scans requests still awaiting a score.
CREATE INDEX IF NOT EXISTS idx_nps_pending ON public.nps_responses(contact_id)
  WHERE score IS NULL;

ALTER TABLE public.nps_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws members read nps" ON public.nps_responses
  FOR SELECT USING (workspace_id IN (SELECT auth_workspace_ids()));
-- Writes via service role (crons).
