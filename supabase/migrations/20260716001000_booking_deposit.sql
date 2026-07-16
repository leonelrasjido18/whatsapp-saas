-- Seña (deposit) per booking service. When > 0, the agent asks the customer to
-- pay it to confirm the appointment — a proven way to cut no-shows in salons,
-- clinics, etc. The payment goes to the merchant's MercadoPago via a checkout link.

ALTER TABLE public.booking_services
  ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
