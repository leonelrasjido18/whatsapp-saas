-- Migration: native appointments / bookings (no HighLevel dependency)
-- Opens the services vertical (peluquerías, consultorios, gimnasios): the agent
-- checks availability from weekly rules, books, and reminders go out by cron.

-- Bookable services (distinct from the commerce `products` table — these carry a
-- duration and drive the availability calendar).
CREATE TABLE IF NOT EXISTS public.booking_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  duration_min INT NOT NULL DEFAULT 30 CHECK (duration_min BETWEEN 5 AND 1440),
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_booking_services_ws
  ON public.booking_services(workspace_id) WHERE active = TRUE;

-- Weekly recurring open hours. weekday: 0=Sunday … 6=Saturday.
CREATE TABLE IF NOT EXISTS public.availability_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_availability_rules_ws
  ON public.availability_rules(workspace_id, weekday);

-- NOTE: named `bookings`, not `appointments`, because the foundation migration
-- already defines an `appointments` table for the HighLevel scheduling flow
-- (scheduled_at / hl_appointment_id). This native booking feature is separate.
CREATE TABLE IF NOT EXISTS public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  service_id UUID REFERENCES public.booking_services(id) ON DELETE SET NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN (
    'pending', 'confirmed', 'cancelled', 'no_show', 'done'
  )),
  customer_name TEXT,
  note TEXT,
  reminder_sent_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL, -- NULL = IA
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bookings_ws_time
  ON public.bookings(workspace_id, starts_at)
  WHERE status IN ('pending', 'confirmed');
CREATE INDEX IF NOT EXISTS idx_bookings_reminder
  ON public.bookings(workspace_id, starts_at)
  WHERE status = 'confirmed' AND reminder_sent_at IS NULL;

CREATE TRIGGER trg_booking_services_updated_at
  BEFORE UPDATE ON public.booking_services
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER trg_bookings_updated_at
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.booking_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.availability_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws members read booking_services" ON public.booking_services
  FOR SELECT USING (workspace_id IN (SELECT auth_workspace_ids()));
CREATE POLICY "ws admins manage booking_services" ON public.booking_services
  FOR ALL USING (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager']::workspace_role[])
  ) WITH CHECK (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager']::workspace_role[])
  );

CREATE POLICY "ws members read availability_rules" ON public.availability_rules
  FOR SELECT USING (workspace_id IN (SELECT auth_workspace_ids()));
CREATE POLICY "ws admins manage availability_rules" ON public.availability_rules
  FOR ALL USING (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager']::workspace_role[])
  ) WITH CHECK (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager']::workspace_role[])
  );

CREATE POLICY "ws members read bookings" ON public.bookings
  FOR SELECT USING (workspace_id IN (SELECT auth_workspace_ids()));
CREATE POLICY "ws members manage bookings" ON public.bookings
  FOR ALL USING (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager','agent']::workspace_role[])
  ) WITH CHECK (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager','agent']::workspace_role[])
  );

-- ── Seed native booking tools into the catalog ────────────────────────────────
INSERT INTO public.tools (key, name, description, schema, sensitivity) VALUES
  (
    'check_availability_native',
    'Ver Disponibilidad (Turnos)',
    'Consulta los horarios libres reales para dar turno en un rango de fechas, según los horarios de atención del negocio y los turnos ya ocupados. Úsala ANTES de agendar para ofrecer horarios que sí existen.',
    '{"type":"object","properties":{"date_from":{"type":"string","description":"Fecha inicial ISO (ej: 2026-07-15)"},"date_to":{"type":"string","description":"Fecha final ISO (ej: 2026-07-20)"},"service_id":{"type":"string","description":"ID del servicio a agendar (opcional)"}},"required":["date_from","date_to"]}',
    'read'
  ),
  (
    'book_appointment',
    'Agendar Turno',
    'Reserva un turno para el cliente en un horario disponible. Usar SOLO cuando el cliente confirme fecha y hora. Luego confirmar el turno agendado.',
    '{"type":"object","properties":{"starts_at":{"type":"string","description":"Inicio del turno en ISO con offset (ej: 2026-07-15T10:00:00-03:00)"},"service_id":{"type":"string","description":"ID del servicio (opcional)"},"customer_name":{"type":"string","description":"Nombre del cliente para el turno"},"note":{"type":"string"}},"required":["starts_at"]}',
    'write'
  ),
  (
    'cancel_appointment',
    'Cancelar Turno',
    'Cancela un turno existente del cliente. Si el cliente tiene varios, pedir cuál. Retorna los turnos próximos si no se especifica cuál cancelar.',
    '{"type":"object","properties":{"appointment_id":{"type":"string","description":"ID del turno a cancelar (opcional: si falta, se listan los próximos turnos del contacto)"}},"required":[]}',
    'write'
  )
ON CONFLICT (key) DO UPDATE
  SET name        = EXCLUDED.name,
      description = EXCLUDED.description,
      schema      = EXCLUDED.schema,
      sensitivity = EXCLUDED.sensitivity;
