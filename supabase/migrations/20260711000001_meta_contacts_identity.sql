-- ============================================================
-- Meta channels: contact identity by PSID/IGSID + webhook routing indexes.
-- Runs in a separate transaction from the enum migration (55P04-safe).
-- ============================================================

-- 1) contacts.phone becomes optional (Meta contacts have no phone number).
--    uq_contacts_workspace_phone STAYS: UNIQUE treats NULLs as distinct, so many
--    NULL-phone rows coexist while the WhatsApp upsert path is unchanged.
ALTER TABLE contacts ALTER COLUMN phone DROP NOT NULL;

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS channel conversation_channel NOT NULL DEFAULT 'whatsapp',
  ADD COLUMN IF NOT EXISTS external_id TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

COMMENT ON COLUMN contacts.external_id IS
  'Channel-scoped user id: PSID (facebook) or IGSID (instagram). NULL for WhatsApp contacts.';

-- 2) Dedup key for Meta identities. Must be a REAL unique constraint, NOT a
--    partial index: supabase-js .upsert({ onConflict: 'workspace_id,channel,external_id' })
--    emits plain ON CONFLICT (cols...) which Postgres can only infer from a full
--    constraint (same issue already fixed for messages.wamid in
--    20260609000005). Existing WhatsApp rows have external_id NULL → never conflict.
ALTER TABLE contacts
  ADD CONSTRAINT uq_contacts_workspace_channel_external
  UNIQUE (workspace_id, channel, external_id);

-- 3) Integrity: every contact keeps at least one routable identity.
ALTER TABLE contacts
  ADD CONSTRAINT chk_contacts_identity
  CHECK (phone IS NOT NULL OR external_id IS NOT NULL);

-- 4) Webhook fan-in: resolve the integration by entry.id (page_id or
--    ig_account_id) on every Meta webhook POST.
CREATE INDEX IF NOT EXISTS idx_integrations_meta_page
  ON integrations ((config->>'page_id')) WHERE provider = 'meta';
CREATE INDEX IF NOT EXISTS idx_integrations_meta_ig
  ON integrations ((config->>'ig_account_id')) WHERE provider = 'meta';

-- 5) messages.wamid doubles as the provider message id for Meta channels
--    (Meta `mid` values are 'm_...' strings — no collision with 'wamid...').
COMMENT ON COLUMN messages.wamid IS
  'Provider message id: WhatsApp wamid or Meta (Messenger/Instagram) mid. Dedup key per workspace.';
