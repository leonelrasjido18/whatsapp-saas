-- Cobro recurrente de la agencia a sus clientes (el $/mes de mantenimiento) vía
-- MercadoPago Preapproval (suscripción). Guarda el estado para el panel.

CREATE TABLE IF NOT EXISTS public.agency_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  mp_preapproval_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','authorized','paused','cancelled')),
  amount NUMERIC(12,2) NOT NULL,
  payer_email TEXT,
  init_point TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agency_subs_workspace ON public.agency_subscriptions(workspace_id, created_at DESC);

ALTER TABLE public.agency_subscriptions ENABLE ROW LEVEL SECURITY;

-- Super admin only.
CREATE POLICY "super admin manage agency_subscriptions" ON public.agency_subscriptions
  FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
