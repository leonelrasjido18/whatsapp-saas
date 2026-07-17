-- Auto-mejora del agente: la IA analiza conversaciones perdidas/con fricción y
-- propone mejoras concretas al prompt. El dueño revisa y aplica con un clic
-- (crea una nueva versión publicada del prompt del agente activo).

CREATE TABLE IF NOT EXISTS public.prompt_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  issue TEXT NOT NULL,
  evidence TEXT,
  suggested_addition TEXT NOT NULL,
  based_on_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','applied','dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_prompt_suggestions_workspace
  ON public.prompt_suggestions(workspace_id, status, created_at DESC);

ALTER TABLE public.prompt_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws members read prompt_suggestions" ON public.prompt_suggestions
  FOR SELECT USING (workspace_id IN (SELECT auth_workspace_ids()));

CREATE POLICY "ws admins update prompt_suggestions" ON public.prompt_suggestions
  FOR UPDATE USING (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager']::workspace_role[])
  ) WITH CHECK (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager']::workspace_role[])
  );
-- Inserts (regenerate) go through the service role after an API auth check.
