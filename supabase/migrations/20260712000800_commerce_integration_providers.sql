-- ============================================================
-- Commerce integrations: add 'mercadopago' and 'afip' to the
-- integration_provider enum so the MercadoPago/AFIP settings can be saved.
--
-- ALTER TYPE ... ADD VALUE is allowed inside a transaction on PG >= 12, but the
-- new value cannot be REFERENCED in the same transaction. This file contains
-- ONLY the enum additions (nothing references them here). Idempotent.
-- ============================================================

ALTER TYPE integration_provider ADD VALUE IF NOT EXISTS 'mercadopago';
ALTER TYPE integration_provider ADD VALUE IF NOT EXISTS 'afip';
