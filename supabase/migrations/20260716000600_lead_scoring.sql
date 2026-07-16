-- Lead scoring: a 0-100 heat score per contact so the owner knows who to chase
-- first. Recomputed by a daily cron from engagement + intent signals.

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS lead_score INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lead_score_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_contacts_lead_score
  ON public.contacts(workspace_id, lead_score DESC);
