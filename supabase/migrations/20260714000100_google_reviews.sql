-- Migration: Google review requests
-- Post-sale automation that asks the customer to leave a Google review, with a
-- tracked redirect link so the owner sees requests-sent vs. clicks.

CREATE TABLE IF NOT EXISTS public.review_settings (
  workspace_id UUID PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  review_url TEXT,                    -- direct Google review link (with Place ID)
  delay_hours INT NOT NULL DEFAULT 24 CHECK (delay_hours BETWEEN 1 AND 168),
  -- Optional approved WhatsApp template for customers already outside the 24h
  -- window. When null, the request is only sent to in-window conversations.
  template_name TEXT,
  requests_sent INT NOT NULL DEFAULT 0,
  clicks INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_review_settings_updated_at
  BEFORE UPDATE ON public.review_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.review_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws members read review_settings" ON public.review_settings
  FOR SELECT USING (workspace_id IN (SELECT auth_workspace_ids()));

CREATE POLICY "ws admins manage review_settings" ON public.review_settings
  FOR ALL USING (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager']::workspace_role[])
  ) WITH CHECK (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager']::workspace_role[])
  );

-- Marks a paid order once its review request has been sent (avoids re-sending
-- on each cron run). Mirrors orders.reminder_sent_at for cart abandonment.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS review_request_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_orders_paid_no_review
  ON public.orders(workspace_id, paid_at)
  WHERE status = 'paid' AND review_request_sent_at IS NULL;

-- Atomic counter bump used by the tracked-redirect route (service role).
CREATE OR REPLACE FUNCTION public.increment_review_click(p_workspace_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.review_settings
  SET clicks = clicks + 1
  WHERE workspace_id = p_workspace_id;
$$;

-- Atomic counter bump used by the review-request cron (service role).
CREATE OR REPLACE FUNCTION public.increment_review_requests_sent(p_workspace_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.review_settings
  SET requests_sent = requests_sent + 1
  WHERE workspace_id = p_workspace_id;
$$;
