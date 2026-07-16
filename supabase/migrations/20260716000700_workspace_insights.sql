-- Stores the latest AI-generated insights per workspace (what customers ask,
-- objections, products they request that aren't in the catalog, overall
-- sentiment). One row per workspace, refreshed on demand.

CREATE TABLE IF NOT EXISTS public.workspace_insights (
  workspace_id UUID PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.workspace_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws members read workspace_insights" ON public.workspace_insights
  FOR SELECT USING (workspace_id IN (SELECT auth_workspace_ids()));

-- Writes go through the service role (API route after auth); no client policy.
