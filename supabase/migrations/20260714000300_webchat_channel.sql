-- Migration: web chat channel (embeddable widget)
-- Adds 'webchat' to the channel enum and a per-workspace settings row holding
-- the public embed key, allowed origin and branding. The widget posts to a
-- public endpoint that routes messages into the same agent/inbox pipeline.

-- ALTER TYPE ... ADD VALUE must run outside a transaction and can't be used in
-- the same statement batch it's created in — matches the meta_channel_enums
-- migration's pattern. IF NOT EXISTS makes re-runs safe.
ALTER TYPE conversation_channel ADD VALUE IF NOT EXISTS 'webchat';

CREATE TABLE IF NOT EXISTS public.webchat_settings (
  workspace_id UUID PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  -- Public, non-secret key that identifies the workspace from the widget.
  public_key TEXT NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  allowed_origin TEXT,                 -- e.g. https://cliente.com (CORS lock)
  title TEXT NOT NULL DEFAULT 'Chateá con nosotros',
  color TEXT NOT NULL DEFAULT '#2563eb',
  welcome_message TEXT DEFAULT '¡Hola! ¿En qué te puedo ayudar?',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webchat_settings_public_key
  ON public.webchat_settings(public_key);

CREATE TRIGGER trg_webchat_settings_updated_at
  BEFORE UPDATE ON public.webchat_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.webchat_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws members read webchat_settings" ON public.webchat_settings
  FOR SELECT USING (workspace_id IN (SELECT auth_workspace_ids()));

CREATE POLICY "ws admins manage webchat_settings" ON public.webchat_settings
  FOR ALL USING (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager']::workspace_role[])
  ) WITH CHECK (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager']::workspace_role[])
  );
