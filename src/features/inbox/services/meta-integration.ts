import { createClient as createSbClient } from "@supabase/supabase-js";
import { fetchMetaProfile, isAuthError } from "./meta-client";

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export interface MetaIntegration {
  workspaceId: string;
  pageId: string;
  pageAccessToken: string;
  igAccountId: string | null;
  config: Record<string, unknown>;
}

interface IntegrationRow {
  workspace_id: string;
  credentials: Record<string, unknown>;
  config: Record<string, unknown>;
}

function toMetaIntegration(row: IntegrationRow): MetaIntegration | null {
  const pageId = row.config?.page_id;
  if (typeof pageId !== "string" || !pageId) return null;
  return {
    workspaceId: row.workspace_id,
    pageId,
    pageAccessToken:
      (row.credentials?.page_access_token as string | undefined) ?? "",
    igAccountId:
      typeof row.config?.ig_account_id === "string"
        ? (row.config.ig_account_id as string)
        : null,
    config: row.config ?? {},
  };
}

/** Loads the enabled Meta integration of a workspace, or null. */
export async function getMetaIntegration(
  workspaceId: string,
): Promise<MetaIntegration | null> {
  const { data } = await svc()
    .from("integrations")
    .select("workspace_id, credentials, config")
    .eq("workspace_id", workspaceId)
    .eq("provider", "meta")
    .eq("enabled", true)
    .maybeSingle();

  return data ? toMetaIntegration(data as IntegrationRow) : null;
}

/**
 * Resolves the integration that owns a webhook `entry.id` (a page_id for
 * `object: "page"` events, an ig_account_id for `object: "instagram"`).
 * Backed by the expression indexes idx_integrations_meta_page / _ig.
 */
export async function getMetaIntegrationByEntryId(
  entryId: string,
): Promise<MetaIntegration | null> {
  const { data } = await svc()
    .from("integrations")
    .select("workspace_id, credentials, config")
    .eq("provider", "meta")
    .eq("enabled", true)
    .or(`config->>page_id.eq.${entryId},config->>ig_account_id.eq.${entryId}`)
    .limit(1)
    .maybeSingle();

  return data ? toMetaIntegration(data as IntegrationRow) : null;
}

/**
 * Marks the workspace's Meta connection as needing re-auth (Graph error 190:
 * token revoked/expired). Surfaced as a warning banner in Settings.
 */
export async function flagMetaReconnectRequired(
  workspaceId: string,
): Promise<void> {
  const supabase = svc();
  const { data } = await supabase
    .from("integrations")
    .select("config")
    .eq("workspace_id", workspaceId)
    .eq("provider", "meta")
    .maybeSingle();
  if (!data) return;

  const config = (data.config ?? {}) as Record<string, unknown>;
  if (config.reconnect_required === true) return; // already flagged

  await supabase
    .from("integrations")
    .update({ config: { ...config, reconnect_required: true } })
    .eq("workspace_id", workspaceId)
    .eq("provider", "meta");

  await supabase.from("events").insert({
    workspace_id: workspaceId,
    type: "meta_token_invalid",
    level: "warn",
    payload: { message: "Meta page token invalid — reconnect required" },
  });
}

/**
 * Fills in name/avatar for a Meta contact that arrived without a profile
 * (messaging webhooks carry no display name). Fire-and-forget from the
 * webhook's after() job — never throws.
 */
export async function enrichMetaContactProfile(params: {
  workspaceId: string;
  contactId: string;
  channel: "facebook" | "instagram";
  externalId: string;
}): Promise<void> {
  try {
    const supabase = svc();
    const { data: contact } = await supabase
      .from("contacts")
      .select("name, avatar_url")
      .eq("id", params.contactId)
      .maybeSingle();
    if (!contact || (contact.name && contact.avatar_url)) return;

    const integration = await getMetaIntegration(params.workspaceId);
    if (!integration?.pageAccessToken) return;

    const profile = await fetchMetaProfile({
      pageAccessToken: integration.pageAccessToken,
      userId: params.externalId,
      channel: params.channel,
    });
    if (!profile) return;

    // Instagram: prefer "Nombre (@usuario)" so operators can find the person.
    const displayName =
      profile.name && profile.username && params.channel === "instagram"
        ? `${profile.name} (@${profile.username})`
        : (profile.name ?? (profile.username ? `@${profile.username}` : null));

    const update: Record<string, unknown> = {};
    if (!contact.name && displayName) update.name = displayName;
    if (!contact.avatar_url && profile.avatarUrl) {
      update.avatar_url = profile.avatarUrl;
    }
    if (Object.keys(update).length === 0) return;

    update.updated_at = new Date().toISOString();
    await supabase.from("contacts").update(update).eq("id", params.contactId);
  } catch (err) {
    if (isAuthError(err)) {
      await flagMetaReconnectRequired(params.workspaceId).catch(() => {});
    }
    console.warn(
      "[meta-integration] profile enrichment failed:",
      err instanceof Error ? err.message : "unknown",
    );
  }
}
