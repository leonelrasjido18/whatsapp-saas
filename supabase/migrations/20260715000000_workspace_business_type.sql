-- Migration: workspace business type (vertical)
-- Drives which modules the client sees: 'comercio' (catálogo/ventas/pagos),
-- 'servicios' (turnos/agenda), or 'general' (todo). Set by the super admin.

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS business_type TEXT NOT NULL DEFAULT 'general'
    CHECK (business_type IN ('comercio', 'servicios', 'general'));
