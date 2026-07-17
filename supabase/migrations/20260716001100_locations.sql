-- Multi-sucursal (lite). A workspace can have several branches. The agent learns
-- them (address/hours/phone) so it can answer "¿dónde están?" and direct people,
-- and bookings/orders can be tagged to a branch. Per-location stock/availability
-- is a future step — this is the foundation.

CREATE TABLE IF NOT EXISTS public.locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  hours TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_locations_workspace ON public.locations(workspace_id) WHERE is_active;

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL;
ALTER TABLE public.orders   ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL;

ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws members read locations" ON public.locations
  FOR SELECT USING (workspace_id IN (SELECT auth_workspace_ids()));

CREATE POLICY "ws admins manage locations" ON public.locations
  FOR ALL USING (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager']::workspace_role[])
  ) WITH CHECK (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager']::workspace_role[])
  );
