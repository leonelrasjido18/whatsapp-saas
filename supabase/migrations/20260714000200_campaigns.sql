-- Migration: WhatsApp campaigns (broadcast / difusión masiva)
-- Segmented template blasts to opted-in contacts, dispatched in rate-limited
-- batches by a cron. Replies land in the normal inbox (the AI agent handles
-- them) — that's the differentiator vs. a pure broadcast tool.

CREATE TABLE IF NOT EXISTS public.campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  template_name TEXT NOT NULL,          -- YCloud/Meta approved template
  template_language TEXT NOT NULL DEFAULT 'es',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'scheduled', 'sending', 'paused', 'done', 'failed'
  )),
  segment JSONB NOT NULL DEFAULT '{}'::jsonb,  -- serialized filters
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  -- Running tally so the campaign card renders without a recipients scan.
  stats JSONB NOT NULL DEFAULT
    '{"total":0,"sent":0,"delivered":0,"read":0,"failed":0,"replies":0}'::jsonb,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_workspace ON public.campaigns(workspace_id, status);
-- The dispatch cron scans for campaigns due to send.
CREATE INDEX IF NOT EXISTS idx_campaigns_sending
  ON public.campaigns(status, scheduled_at)
  WHERE status IN ('scheduled', 'sending');

CREATE TRIGGER trg_campaigns_updated_at
  BEFORE UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE IF NOT EXISTS public.campaign_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'sent', 'delivered', 'read', 'failed', 'opted_out'
  )),
  wamid TEXT,
  error TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_recipients_pending
  ON public.campaign_recipients(campaign_id)
  WHERE status = 'pending';
-- Delivery webhooks match receipts back to a recipient by wamid.
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_wamid
  ON public.campaign_recipients(wamid)
  WHERE wamid IS NOT NULL;

-- Contacts can opt out of MARKETING campaigns specifically (via "BAJA"/"STOP")
-- without losing transactional opt_in. Meta compliance — sending to opted-out
-- contacts risks the number's quality rating.
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS campaign_opt_out BOOLEAN NOT NULL DEFAULT FALSE;

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws members read campaigns" ON public.campaigns
  FOR SELECT USING (workspace_id IN (SELECT auth_workspace_ids()));

CREATE POLICY "ws admins manage campaigns" ON public.campaigns
  FOR ALL USING (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager']::workspace_role[])
  ) WITH CHECK (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager']::workspace_role[])
  );

CREATE POLICY "ws members read campaign_recipients" ON public.campaign_recipients
  FOR SELECT USING (workspace_id IN (SELECT auth_workspace_ids()));

-- Recipients are written only by the service role (dispatch cron); no
-- authenticated write policy needed.
