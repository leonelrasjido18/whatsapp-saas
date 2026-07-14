// Campaign dispatch — materializes recipients from the segment, then sends the
// approved template to each in rate-limited batches. Driven by the
// campaign-dispatch cron. All sends are templates (campaigns go to contacts
// outside the 24h window, where Meta requires an approved template).

import { createClient as createSbClient } from "@supabase/supabase-js";
import { sendTemplate, YCloudError } from "@/features/inbox/services/ycloud-client";
import { fetchAudience } from "./segments";
import type { Campaign, CampaignStats } from "../types";

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

type Supabase = ReturnType<typeof svc>;

// How many recipients to send per cron tick, and the pause between sends to stay
// under Meta/YCloud throughput limits. Conservative defaults; a tick sends
// BATCH_PER_TICK messages then yields so a large campaign drains over minutes.
const BATCH_PER_TICK = 100;
const SEND_INTERVAL_MS = 50; // ~20 msg/s

async function loadYCloud(
  supabase: Supabase,
  workspaceId: string,
): Promise<{ apiKey: string; fromPhone: string } | null> {
  const { data } = await supabase
    .from("integrations")
    .select("credentials, config")
    .eq("workspace_id", workspaceId)
    .eq("provider", "ycloud")
    .eq("enabled", true)
    .maybeSingle();

  if (!data) return null;
  const apiKey = (data.credentials as { ycloud_api_key?: string })?.ycloud_api_key ?? "";
  const fromPhone = (data.config as { phone_number?: string })?.phone_number ?? "";
  if (!apiKey || apiKey === "placeholder" || !fromPhone) return null;
  return { apiKey, fromPhone };
}

/**
 * Ensures campaign_recipients rows exist for a campaign's whole audience.
 * Idempotent: the UNIQUE(campaign_id, contact_id) constraint dedupes on retry.
 * Returns the number of recipients now enqueued (0 already existed is fine).
 */
export async function materializeRecipients(
  supabase: Supabase,
  campaign: Campaign,
): Promise<number> {
  const audience = await fetchAudience(
    supabase,
    campaign.workspace_id,
    campaign.segment,
  );
  if (audience.length === 0) return 0;

  const rows = audience.map((c) => ({
    campaign_id: campaign.id,
    workspace_id: campaign.workspace_id,
    contact_id: c.id,
    status: "pending" as const,
  }));

  // upsert with ignoreDuplicates so re-running doesn't error on the unique key.
  const { error } = await supabase
    .from("campaign_recipients")
    .upsert(rows, { onConflict: "campaign_id,contact_id", ignoreDuplicates: true });
  if (error) {
    console.error("[campaign-dispatch] materialize error:", error);
    throw error;
  }

  // Reflect the true total in the campaign stats.
  const { count } = await supabase
    .from("campaign_recipients")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaign.id);

  await patchStats(supabase, campaign.id, { total: count ?? rows.length });
  return count ?? rows.length;
}

/** Merges a partial stats patch into the campaign's stats jsonb. */
async function patchStats(
  supabase: Supabase,
  campaignId: string,
  patch: Partial<CampaignStats>,
): Promise<void> {
  const { data } = await supabase
    .from("campaigns")
    .select("stats")
    .eq("id", campaignId)
    .maybeSingle();
  const current = (data?.stats as CampaignStats) ?? {
    total: 0,
    sent: 0,
    delivered: 0,
    read: 0,
    failed: 0,
    replies: 0,
  };
  await supabase
    .from("campaigns")
    .update({ stats: { ...current, ...patch } })
    .eq("id", campaignId);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Sends up to BATCH_PER_TICK pending recipients for one campaign. Returns how
 * many were processed; caller loops across campaigns until the tick budget is
 * spent. Marks the campaign 'done' when no pending recipients remain.
 */
export async function dispatchCampaignBatch(
  supabase: Supabase,
  campaign: Campaign,
): Promise<number> {
  const yc = await loadYCloud(supabase, campaign.workspace_id);
  if (!yc) {
    // Can't send without credentials — pause so it doesn't spin every minute.
    await supabase
      .from("campaigns")
      .update({ status: "paused" })
      .eq("id", campaign.id);
    return 0;
  }

  const { data: pending } = await supabase
    .from("campaign_recipients")
    .select("id, contact_id")
    .eq("campaign_id", campaign.id)
    .eq("status", "pending")
    .limit(BATCH_PER_TICK);

  if (!pending || pending.length === 0) {
    await finalizeIfComplete(supabase, campaign.id);
    return 0;
  }

  // Load phones for this batch's contacts in one query.
  const contactIds = pending.map((p) => p.contact_id);
  const { data: contacts } = await supabase
    .from("contacts")
    .select("id, phone, campaign_opt_out")
    .in("id", contactIds);
  const contactById = new Map(
    (contacts ?? []).map((c) => [c.id as string, c]),
  );

  let sent = 0;
  let failed = 0;
  let optedOut = 0;

  for (const recipient of pending) {
    const contact = contactById.get(recipient.contact_id as string);

    // A contact who opted out between enqueue and send must be skipped.
    if (!contact || contact.campaign_opt_out || !contact.phone) {
      await supabase
        .from("campaign_recipients")
        .update({ status: "opted_out" })
        .eq("id", recipient.id);
      optedOut++;
      continue;
    }

    try {
      const result = await sendTemplate({
        apiKey: yc.apiKey,
        from: yc.fromPhone,
        to: contact.phone as string,
        templateName: campaign.template_name,
        language: campaign.template_language,
      });
      await supabase
        .from("campaign_recipients")
        .update({
          status: "sent",
          wamid: result.wamid || null,
          sent_at: new Date().toISOString(),
        })
        .eq("id", recipient.id);
      sent++;
    } catch (err) {
      const message =
        err instanceof YCloudError
          ? `YCloud ${err.status}`
          : err instanceof Error
            ? err.message
            : "error";
      await supabase
        .from("campaign_recipients")
        .update({ status: "failed", error: message })
        .eq("id", recipient.id);
      failed++;
    }

    await sleep(SEND_INTERVAL_MS);
  }

  await bumpStats(supabase, campaign.id, { sent, failed, optedOut });
  await finalizeIfComplete(supabase, campaign.id);

  return pending.length;
}

/** Increments sent/failed counters additively (batch deltas). */
async function bumpStats(
  supabase: Supabase,
  campaignId: string,
  delta: { sent: number; failed: number; optedOut: number },
): Promise<void> {
  const { data } = await supabase
    .from("campaigns")
    .select("stats")
    .eq("id", campaignId)
    .maybeSingle();
  const s = (data?.stats as CampaignStats) ?? {
    total: 0,
    sent: 0,
    delivered: 0,
    read: 0,
    failed: 0,
    replies: 0,
  };
  await supabase
    .from("campaigns")
    .update({
      stats: {
        ...s,
        sent: s.sent + delta.sent,
        failed: s.failed + delta.failed,
      },
    })
    .eq("id", campaignId);
}

/** Marks the campaign 'done' once no recipients remain pending. */
async function finalizeIfComplete(
  supabase: Supabase,
  campaignId: string,
): Promise<void> {
  const { count } = await supabase
    .from("campaign_recipients")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .eq("status", "pending");

  if ((count ?? 0) === 0) {
    await supabase
      .from("campaigns")
      .update({ status: "done", finished_at: new Date().toISOString() })
      .eq("id", campaignId)
      .eq("status", "sending");
  }
}
