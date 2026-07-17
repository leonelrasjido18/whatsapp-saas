-- Puntos de fidelidad. El cliente acumula puntos por sus compras y la IA le puede
-- decir su saldo. Acumulación por un cron sobre órdenes pagas (idempotente vía
-- points_awarded_at). Tasa por defecto: 1 punto por cada $100 gastados.

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS loyalty_points INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS points_awarded_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_orders_points_pending
  ON public.orders(workspace_id)
  WHERE status = 'paid' AND points_awarded_at IS NULL;
