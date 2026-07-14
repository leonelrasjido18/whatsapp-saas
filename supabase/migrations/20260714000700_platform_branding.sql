-- Migration: platform branding (white-label)
-- Single-row settings that let the agency rebrand the whole instance — name,
-- logo and accent color — so it can be resold as their own product. This
-- deployment is single-agency, so branding is platform-wide rather than
-- per-tenant (which would require a custom-domain resolver).

CREATE TABLE IF NOT EXISTS public.platform_settings (
  -- Enforced singleton: only one row, always id = TRUE.
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id = TRUE),
  brand_name TEXT NOT NULL DEFAULT 'Agente WA',
  logo_url TEXT,
  primary_color TEXT NOT NULL DEFAULT '#2563eb',
  support_email TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.platform_settings (id) VALUES (TRUE)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

-- Everyone signed in can read the branding (header, etc.).
CREATE POLICY "authenticated read platform_settings" ON public.platform_settings
  FOR SELECT TO authenticated USING (TRUE);

-- Only the super admin (agency owner) can change it.
CREATE POLICY "super admin manage platform_settings" ON public.platform_settings
  FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
