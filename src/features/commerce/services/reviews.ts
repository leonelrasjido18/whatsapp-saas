// Google review requests — settings CRUD + click tracking.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface ReviewSettings {
  workspace_id: string;
  enabled: boolean;
  review_url: string | null;
  delay_hours: number;
  template_name: string | null;
  requests_sent: number;
  clicks: number;
}

export async function getReviewSettings(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<ReviewSettings | null> {
  const { data, error } = await supabase
    .from("review_settings")
    .select(
      "workspace_id, enabled, review_url, delay_hours, template_name, requests_sent, clicks",
    )
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) {
    console.error("[reviews] getReviewSettings error:", error);
    return null;
  }
  return (data as ReviewSettings) ?? null;
}

export interface UpdateReviewSettingsInput {
  enabled?: boolean;
  review_url?: string | null;
  delay_hours?: number;
  template_name?: string | null;
}

export async function upsertReviewSettings(
  supabase: SupabaseClient,
  workspaceId: string,
  input: UpdateReviewSettingsInput,
): Promise<ReviewSettings> {
  const { data, error } = await supabase
    .from("review_settings")
    .upsert(
      { workspace_id: workspaceId, ...input, updated_at: new Date().toISOString() },
      { onConflict: "workspace_id" },
    )
    .select(
      "workspace_id, enabled, review_url, delay_hours, template_name, requests_sent, clicks",
    )
    .single();

  if (error) throw error;
  return data as ReviewSettings;
}

/** Bumps the click counter and returns the destination URL (or null). */
export async function trackReviewClick(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("review_settings")
    .select("review_url, enabled")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  const settings = data as { review_url: string | null; enabled: boolean } | null;
  if (!settings?.review_url) return null;

  await supabase.rpc("increment_review_click", { p_workspace_id: workspaceId });
  return settings.review_url;
}
