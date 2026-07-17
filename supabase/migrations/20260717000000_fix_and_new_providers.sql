-- Fix: 'google_calendar' was used as an integrations.provider value by the
-- Google Calendar sync feature (previous batch) but was never added to the
-- integration_provider enum — every token save was failing silently in
-- production. Add it now, plus 'vapi' for the new phone-AI integration and
-- 'phone' as a conversation channel (calls logged as conversations).

ALTER TYPE integration_provider ADD VALUE IF NOT EXISTS 'google_calendar';
ALTER TYPE integration_provider ADD VALUE IF NOT EXISTS 'vapi';
ALTER TYPE conversation_channel ADD VALUE IF NOT EXISTS 'phone';
