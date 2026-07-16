-- Track whether the customer was already sent their invoice over WhatsApp, so
-- the invoice-notify cron sends it exactly once.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ;
