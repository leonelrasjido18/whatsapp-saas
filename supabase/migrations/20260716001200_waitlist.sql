-- Waitlist: cuando un producto está sin stock, el cliente puede pedir que le
-- avisen cuando vuelva. Un cron notifica al reponerse. Recupera ventas perdidas.

CREATE TABLE IF NOT EXISTS public.waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notified_at TIMESTAMPTZ
);

-- One open request per contact+product.
CREATE UNIQUE INDEX IF NOT EXISTS uq_waitlist_open
  ON public.waitlist(workspace_id, contact_id, product_id)
  WHERE notified_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_waitlist_pending
  ON public.waitlist(product_id)
  WHERE notified_at IS NULL;

ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws members read waitlist" ON public.waitlist
  FOR SELECT USING (workspace_id IN (SELECT auth_workspace_ids()));
-- Writes via service role (agent tool + cron).
