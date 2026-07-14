// Platform branding (white-label) — read for the app shell, update for the
// super admin.

import { createClient as createSbClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface PlatformBranding {
  brand_name: string;
  logo_url: string | null;
  primary_color: string;
  support_email: string | null;
}

const DEFAULTS: PlatformBranding = {
  brand_name: "Agente WA",
  logo_url: null,
  primary_color: "#2563eb",
  support_email: null,
};

function svc(): SupabaseClient {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * Returns the platform branding, falling back to defaults if the row or the
 * table isn't there yet (e.g. migration not applied). Never throws — the app
 * shell must always render.
 */
export async function getPlatformBranding(): Promise<PlatformBranding> {
  try {
    const { data } = await svc()
      .from("platform_settings")
      .select("brand_name, logo_url, primary_color, support_email")
      .eq("id", true)
      .maybeSingle();
    if (!data) return DEFAULTS;
    return {
      brand_name: (data.brand_name as string) || DEFAULTS.brand_name,
      logo_url: (data.logo_url as string | null) ?? null,
      primary_color: (data.primary_color as string) || DEFAULTS.primary_color,
      support_email: (data.support_email as string | null) ?? null,
    };
  } catch {
    return DEFAULTS;
  }
}

export interface UpdateBrandingInput {
  brand_name?: string;
  logo_url?: string | null;
  primary_color?: string;
  support_email?: string | null;
}

export async function updatePlatformBranding(
  input: UpdateBrandingInput,
): Promise<PlatformBranding> {
  const { data, error } = await svc()
    .from("platform_settings")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", true)
    .select("brand_name, logo_url, primary_color, support_email")
    .single();
  if (error) throw error;
  return data as PlatformBranding;
}
