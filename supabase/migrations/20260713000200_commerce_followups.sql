-- ============================================================
-- Soporte para automatizaciones de recuperación de ventas:
--   - orders.reminder_sent_at: marca de recordatorio de carrito abandonado
--     (evita reenviar el mismo recordatorio en cada corrida del cron).
--   - contacts.reengaged_at: marca de re-enganche de inactivos.
-- ============================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS reengaged_at TIMESTAMPTZ;

-- Índice para el cron de carritos abandonados (pending + sin recordatorio).
CREATE INDEX IF NOT EXISTS idx_orders_pending_reminder
  ON orders(workspace_id, created_at)
  WHERE status = 'pending' AND reminder_sent_at IS NULL;
