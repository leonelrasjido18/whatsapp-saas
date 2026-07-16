-- Migration: storefront (#2) — a public mini-site / catalog per workspace.
-- Reuses the existing products (with photos) and the workspace's WhatsApp number:
-- the page shows the catalog and every product has a "Pedir por WhatsApp" button
-- that deep-links to the business chat with a prefilled message. Resolved by a
-- public_key (like webchat) so the internal slug isn't exposed and the owner can
-- disable it without breaking anything else.

CREATE TABLE IF NOT EXISTS public.storefront_settings (
  workspace_id UUID PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  public_key UUID NOT NULL DEFAULT gen_random_uuid(),
  headline TEXT,
  subheadline TEXT,
  -- Optional override; when null the storefront uses the YCloud phone_number.
  whatsapp_phone TEXT,
  accent_color TEXT NOT NULL DEFAULT '#2563eb',
  -- Whether to show prices (some services prefer "consultar").
  show_prices BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_storefront_public_key
  ON public.storefront_settings(public_key);

CREATE TRIGGER trg_storefront_settings_updated_at
  BEFORE UPDATE ON public.storefront_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.storefront_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws members read storefront_settings" ON public.storefront_settings
  FOR SELECT USING (workspace_id IN (SELECT auth_workspace_ids()));

CREATE POLICY "ws admins manage storefront_settings" ON public.storefront_settings
  FOR ALL USING (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager']::workspace_role[])
  ) WITH CHECK (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager']::workspace_role[])
  );

-- The public storefront page reads via the service role (resolves by public_key),
-- so no anonymous SELECT policy is required.
