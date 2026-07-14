// Campaign CRUD + monthly-quota enforcement. The dispatch loop lives in
// dispatch.ts; this module owns creation, listing, state transitions and the
// per-plan monthly recipient cap.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Campaign, CampaignSegment, CampaignStatus } from "../types";

const DEFAULT_STATS = {
  total: 0,
  sent: 0,
  delivered: 0,
  read: 0,
  failed: 0,
  replies: 0,
};

export async function listCampaigns(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<Campaign[]> {
  const { data, error } = await supabase
    .from("campaigns")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Campaign[];
}

export async function getCampaign(
  supabase: SupabaseClient,
  workspaceId: string,
  campaignId: string,
): Promise<Campaign | null> {
  const { data, error } = await supabase
    .from("campaigns")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("id", campaignId)
    .maybeSingle();
  if (error) throw error;
  return (data as Campaign) ?? null;
}

export interface CreateCampaignInput {
  name: string;
  template_name: string;
  template_language?: string;
  segment: CampaignSegment;
  scheduled_at?: string | null;
  createdBy?: string;
}

export async function createCampaign(
  supabase: SupabaseClient,
  workspaceId: string,
  input: CreateCampaignInput,
): Promise<Campaign> {
  const { data, error } = await supabase
    .from("campaigns")
    .insert({
      workspace_id: workspaceId,
      name: input.name,
      template_name: input.template_name,
      template_language: input.template_language ?? "es",
      segment: input.segment,
      scheduled_at: input.scheduled_at ?? null,
      status: input.scheduled_at ? "scheduled" : "draft",
      stats: DEFAULT_STATS,
      created_by: input.createdBy ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as Campaign;
}

/**
 * Moves a campaign between states from the UI. Only the transitions the UI
 * offers are allowed; the dispatch cron owns sending→done internally.
 */
export async function setCampaignStatus(
  supabase: SupabaseClient,
  workspaceId: string,
  campaignId: string,
  status: Extract<CampaignStatus, "scheduled" | "sending" | "paused" | "draft">,
  scheduledAt?: string | null,
): Promise<Campaign> {
  const patch: Record<string, unknown> = { status };
  if (scheduledAt !== undefined) patch.scheduled_at = scheduledAt;

  const { data, error } = await supabase
    .from("campaigns")
    .update(patch)
    .eq("workspace_id", workspaceId)
    .eq("id", campaignId)
    .select("*")
    .single();
  if (error) throw error;
  return data as Campaign;
}

export async function deleteCampaign(
  supabase: SupabaseClient,
  workspaceId: string,
  campaignId: string,
): Promise<void> {
  const { error } = await supabase
    .from("campaigns")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("id", campaignId);
  if (error) throw error;
}

/**
 * Sum of recipients enqueued across this workspace's campaigns in the current
 * calendar month. Used to enforce the plan's monthly campaign cap.
 */
export async function recipientsSentThisMonth(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<number> {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const { count } = await supabase
    .from("campaign_recipients")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .neq("status", "opted_out")
    .gte("created_at", monthStart.toISOString());

  return count ?? 0;
}
