-- Migration: system_alerts — shared alert/notification store.
-- Powers both #6 (uptime / health-check monitoring) and #5 (low-stock and
-- response-rate alerts). A workspace_id of NULL means a platform-level alert
-- (visible to the super admin only). Otherwise it belongs to a workspace and its
-- admins/managers can see and resolve it.
--
-- Deduplication: an alert carries a `dedup_key`. A partial unique index prevents
-- more than one OPEN (resolved_at IS NULL) alert with the same key, so a cron
-- that runs every 10 min doesn't create a new "integration down" row each time.

CREATE TABLE IF NOT EXISTS public.system_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL = platform-level (super admin). Set = belongs to a workspace.
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,                    -- e.g. integration_down, low_stock, response_rate_drop, bot_silent, ycloud_balance_low
  severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'critical')),
  title TEXT NOT NULL,
  body TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Stable identity of "this specific problem" so re-runs update instead of pile up.
  dedup_key TEXT NOT NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only one OPEN alert per dedup_key.
CREATE UNIQUE INDEX IF NOT EXISTS uq_system_alerts_open_dedup
  ON public.system_alerts(dedup_key)
  WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_system_alerts_workspace_open
  ON public.system_alerts(workspace_id, created_at DESC)
  WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_system_alerts_platform_open
  ON public.system_alerts(created_at DESC)
  WHERE resolved_at IS NULL AND workspace_id IS NULL;

CREATE TRIGGER trg_system_alerts_updated_at
  BEFORE UPDATE ON public.system_alerts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.system_alerts ENABLE ROW LEVEL SECURITY;

-- Super admin sees and manages everything (including platform-level alerts).
CREATE POLICY "super admin manage system_alerts" ON public.system_alerts
  FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- Workspace members read their own workspace's alerts.
CREATE POLICY "ws members read system_alerts" ON public.system_alerts
  FOR SELECT USING (
    workspace_id IS NOT NULL
    AND workspace_id IN (SELECT auth_workspace_ids())
  );

-- Workspace admins/managers can resolve (update) their own workspace's alerts.
CREATE POLICY "ws admins update system_alerts" ON public.system_alerts
  FOR UPDATE USING (
    workspace_id IS NOT NULL
    AND workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager']::workspace_role[])
  ) WITH CHECK (
    workspace_id IS NOT NULL
    AND workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager']::workspace_role[])
  );

-- Inserts come from the service role (crons) which bypasses RLS; no
-- authenticated insert policy needed.
