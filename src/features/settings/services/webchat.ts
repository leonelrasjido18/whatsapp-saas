// Webchat widget settings — read/update for a workspace.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface WebchatSettings {
  workspace_id: string;
  enabled: boolean;
  public_key: string;
  allowed_origin: string | null;
  title: string;
  color: string;
  welcome_message: string | null;
}

/**
 * Returns the workspace's webchat settings, creating the row (with a generated
 * public_key) on first read so the embed snippet is always available.
 */
export async function getOrCreateWebchatSettings(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<WebchatSettings> {
  const { data } = await supabase
    .from("webchat_settings")
    .select("*")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (data) return data as WebchatSettings;

  const { data: created, error } = await supabase
    .from("webchat_settings")
    .insert({ workspace_id: workspaceId })
    .select("*")
    .single();
  if (error) throw error;
  return created as WebchatSettings;
}

export interface UpdateWebchatInput {
  enabled?: boolean;
  allowed_origin?: string | null;
  title?: string;
  color?: string;
  welcome_message?: string | null;
}

export async function updateWebchatSettings(
  supabase: SupabaseClient,
  workspaceId: string,
  input: UpdateWebchatInput,
): Promise<WebchatSettings> {
  // Ensure the row exists before updating.
  await getOrCreateWebchatSettings(supabase, workspaceId);

  const { data, error } = await supabase
    .from("webchat_settings")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .select("*")
    .single();
  if (error) throw error;
  return data as WebchatSettings;
}
