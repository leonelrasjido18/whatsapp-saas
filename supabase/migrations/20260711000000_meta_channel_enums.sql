-- ============================================================
-- Meta channels (Facebook Messenger + Instagram DM): enum values only.
--
-- ALTER TYPE ... ADD VALUE is allowed inside a transaction on PG >= 12, BUT the
-- new value cannot be REFERENCED in the same transaction (error 55P04 "unsafe
-- use of new value of enum type"). The Supabase CLI wraps each migration file
-- in its own transaction, so this file contains ONLY the enum additions;
-- everything that uses 'facebook' / 'instagram' / 'meta' lives in the NEXT
-- migration file. Do not paste both files into the SQL editor as one batch.
-- ============================================================

ALTER TYPE conversation_channel ADD VALUE IF NOT EXISTS 'facebook';
ALTER TYPE conversation_channel ADD VALUE IF NOT EXISTS 'instagram';
ALTER TYPE integration_provider ADD VALUE IF NOT EXISTS 'meta';
