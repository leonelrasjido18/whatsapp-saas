/**
 * Meta Graph API client — Facebook Messenger + Instagram DM.
 * Pure HTTP module (no Supabase imports), mirroring ycloud-client.ts.
 *
 * One centralized Meta App (META_APP_ID / META_APP_SECRET) owned by the SaaS;
 * per-workspace access happens through OAuth-obtained Page Access Tokens.
 * Instagram DMs for an IG professional account linked to a Facebook Page are
 * sent/received through the SAME `/{page_id}/messages` endpoint, using the
 * IGSID as recipient.
 */

const GRAPH_VERSION = "v23.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

/** Permissions requested in the OAuth dialog (all require App Review for production). */
export const META_OAUTH_SCOPES = [
  "pages_show_list",
  "pages_messaging",
  "pages_manage_metadata",
  "instagram_basic",
  "instagram_manage_messages",
  "business_management",
].join(",");

/** Webhook fields the app subscribes each connected page to. */
const SUBSCRIBED_FIELDS =
  "messages,messaging_postbacks,message_deliveries,message_reads";

/** Messenger allows 2000 chars per message; Instagram only 1000. */
const MAX_CHARS = { facebook: 2000, instagram: 1000 } as const;

export class MetaApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: number | null,
    public readonly subcode: number | null,
    public readonly body: unknown,
    message: string,
  ) {
    super(message);
    this.name = "MetaApiError";
  }
}

/**
 * True when the error means the stored token is dead (expired, revoked,
 * password changed) and the tenant must re-run the OAuth connect flow.
 */
export function isAuthError(err: unknown): boolean {
  return (
    err instanceof MetaApiError &&
    (err.code === 190 || err.subcode === 458 || err.subcode === 460)
  );
}

async function graphFetch(
  path: string,
  init: RequestInit & { accessToken?: string } = {},
): Promise<Record<string, unknown>> {
  const { accessToken, ...rest } = init;
  const response = await fetch(`${GRAPH_BASE}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      // Bearer header keeps tokens out of URLs (and therefore out of logs).
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(rest.headers ?? {}),
    },
  });

  let responseBody: unknown;
  try {
    responseBody = await response.json();
  } catch {
    responseBody = null;
  }

  if (!response.ok) {
    const err = (responseBody as Record<string, unknown> | null)?.error as
      | { code?: number; error_subcode?: number; message?: string }
      | undefined;
    throw new MetaApiError(
      response.status,
      typeof err?.code === "number" ? err.code : null,
      typeof err?.error_subcode === "number" ? err.error_subcode : null,
      responseBody,
      `Meta Graph API error ${response.status}${err?.code ? ` (code ${err.code})` : ""}`,
    );
  }

  return (responseBody as Record<string, unknown>) ?? {};
}

// ──────────────────────────────────────────────────────────────────────────────
// Messaging
// ──────────────────────────────────────────────────────────────────────────────

export interface SendMetaTextParams {
  pageId: string;
  pageAccessToken: string;
  /** PSID (facebook) or IGSID (instagram) */
  recipientId: string;
  text: string;
  channel: "facebook" | "instagram";
}

/**
 * Splits text into channel-sized chunks, preferring paragraph then sentence
 * boundaries, so long AI replies never get rejected for length.
 */
export function chunkMessageText(
  text: string,
  channel: "facebook" | "instagram",
): string[] {
  const max = MAX_CHARS[channel];
  const trimmed = text.trim();
  if (trimmed.length <= max) return [trimmed];

  const chunks: string[] = [];
  let remaining = trimmed;
  while (remaining.length > max) {
    const slice = remaining.slice(0, max);
    // Prefer breaking on a paragraph, then sentence end, then whitespace.
    let breakAt = slice.lastIndexOf("\n\n");
    if (breakAt < max * 0.5) {
      const sentence = slice.search(/[^.!?]*$/);
      breakAt = sentence > max * 0.5 ? sentence : slice.lastIndexOf(" ");
    }
    if (breakAt <= 0) breakAt = max;
    chunks.push(remaining.slice(0, breakAt).trim());
    remaining = remaining.slice(breakAt).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

/**
 * Sends a text message (chunked if needed) via the Meta Send API.
 * Returns the mids of every chunk, in send order.
 * Throws MetaApiError on non-2xx responses.
 */
export async function sendMetaText(
  params: SendMetaTextParams,
): Promise<{ mids: string[] }> {
  const { pageId, pageAccessToken, recipientId, text, channel } = params;
  const mids: string[] = [];

  for (const chunk of chunkMessageText(text, channel)) {
    const data = await graphFetch(`/${pageId}/messages`, {
      method: "POST",
      accessToken: pageAccessToken,
      body: JSON.stringify({
        recipient: { id: recipientId },
        messaging_type: "RESPONSE",
        message: { text: chunk },
      }),
    });
    if (typeof data.message_id === "string") mids.push(data.message_id);
  }

  return { mids };
}

/**
 * Sends a sender action (typing indicator / mark seen). Best-effort: never
 * throws — a failed indicator must not take down the AI reply pipeline
 * (mirrors ycloud-client.sendTypingIndicator).
 */
export async function sendSenderAction(params: {
  pageId: string;
  pageAccessToken: string;
  recipientId: string;
  action: "typing_on" | "typing_off" | "mark_seen";
}): Promise<void> {
  const { pageId, pageAccessToken, recipientId, action } = params;
  try {
    await graphFetch(`/${pageId}/messages`, {
      method: "POST",
      accessToken: pageAccessToken,
      body: JSON.stringify({
        recipient: { id: recipientId },
        sender_action: action,
      }),
    });
  } catch (err) {
    // Instagram rejects some sender actions — not worth failing the reply.
    console.warn(
      "[meta-client] sender action failed:",
      err instanceof Error ? err.message : "unknown",
    );
  }
}

/**
 * Fetches the customer profile for inbox display. Returns null on ANY error —
 * the profile API 404s when the user disallows it, and in dev mode for users
 * without an app role.
 */
export async function fetchMetaProfile(params: {
  pageAccessToken: string;
  userId: string;
  channel: "facebook" | "instagram";
}): Promise<{
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
} | null> {
  const { pageAccessToken, userId, channel } = params;
  const fields =
    channel === "instagram"
      ? "name,username,profile_pic"
      : "first_name,last_name,profile_pic";
  try {
    const data = await graphFetch(`/${userId}?fields=${fields}`, {
      accessToken: pageAccessToken,
    });
    const first = typeof data.first_name === "string" ? data.first_name : "";
    const last = typeof data.last_name === "string" ? data.last_name : "";
    const igName = typeof data.name === "string" ? data.name : "";
    const name = (channel === "instagram" ? igName : `${first} ${last}`.trim())
      || null;
    return {
      name,
      username: typeof data.username === "string" ? data.username : null,
      avatarUrl:
        typeof data.profile_pic === "string" ? data.profile_pic : null,
    };
  } catch {
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// OAuth (centralized app) — used by /api/integrations/meta/oauth/*
// ──────────────────────────────────────────────────────────────────────────────

export function buildOAuthDialogUrl(params: {
  redirectUri: string;
  state: string;
}): string {
  const url = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);
  url.searchParams.set("client_id", process.env.META_APP_ID ?? "");
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("state", params.state);
  url.searchParams.set("scope", META_OAUTH_SCOPES);
  url.searchParams.set("response_type", "code");
  return url.toString();
}

/** Exchanges the OAuth code for a short-lived user access token. */
export async function exchangeCodeForToken(params: {
  code: string;
  redirectUri: string;
}): Promise<string> {
  const qs = new URLSearchParams({
    client_id: process.env.META_APP_ID ?? "",
    client_secret: process.env.META_APP_SECRET ?? "",
    redirect_uri: params.redirectUri,
    code: params.code,
  });
  const data = await graphFetch(`/oauth/access_token?${qs}`);
  const token = data.access_token;
  if (typeof token !== "string" || !token) {
    throw new MetaApiError(500, null, null, data, "No access_token in response");
  }
  return token;
}

/** Exchanges a short-lived user token for a long-lived one (~60 days). */
export async function getLongLivedUserToken(
  shortLivedToken: string,
): Promise<{ token: string; expiresAt: string | null }> {
  const qs = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: process.env.META_APP_ID ?? "",
    client_secret: process.env.META_APP_SECRET ?? "",
    fb_exchange_token: shortLivedToken,
  });
  const data = await graphFetch(`/oauth/access_token?${qs}`);
  const token = data.access_token;
  if (typeof token !== "string" || !token) {
    throw new MetaApiError(500, null, null, data, "No access_token in response");
  }
  const expiresIn = typeof data.expires_in === "number" ? data.expires_in : null;
  return {
    token,
    expiresAt: expiresIn
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : null,
  };
}

export interface MetaPageCandidate {
  pageId: string;
  name: string;
  /** Page token derived from a long-lived user token — no scheduled expiry. */
  pageAccessToken: string;
  igAccountId: string | null;
  igUsername: string | null;
}

/** Lists the pages the user manages, with page tokens + linked IG accounts. */
export async function listPagesWithInstagram(
  userToken: string,
): Promise<MetaPageCandidate[]> {
  const data = await graphFetch(
    `/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&limit=100`,
    { accessToken: userToken },
  );

  const items = Array.isArray(data.data) ? data.data : [];
  const candidates: MetaPageCandidate[] = [];
  for (const item of items) {
    const page = item as Record<string, unknown>;
    if (typeof page.id !== "string" || typeof page.access_token !== "string") {
      continue;
    }
    const ig = page.instagram_business_account as
      | { id?: string; username?: string }
      | undefined;
    candidates.push({
      pageId: page.id,
      name: typeof page.name === "string" ? page.name : page.id,
      pageAccessToken: page.access_token,
      igAccountId: typeof ig?.id === "string" ? ig.id : null,
      igUsername: typeof ig?.username === "string" ? ig.username : null,
    });
  }
  return candidates;
}

/**
 * Subscribes the app to the page's webhook events — without this, the page's
 * messages never reach /api/webhooks/meta.
 */
export async function subscribePageToWebhooks(params: {
  pageId: string;
  pageAccessToken: string;
}): Promise<void> {
  await graphFetch(
    `/${params.pageId}/subscribed_apps?subscribed_fields=${SUBSCRIBED_FIELDS}`,
    { method: "POST", accessToken: params.pageAccessToken },
  );
}

/** Best-effort unsubscribe on disconnect — never throws. */
export async function unsubscribePageFromWebhooks(params: {
  pageId: string;
  pageAccessToken: string;
}): Promise<void> {
  try {
    await graphFetch(`/${params.pageId}/subscribed_apps`, {
      method: "DELETE",
      accessToken: params.pageAccessToken,
    });
  } catch (err) {
    console.warn(
      "[meta-client] unsubscribe failed:",
      err instanceof Error ? err.message : "unknown",
    );
  }
}

/** Fetches page name (+ IG username) — used by the "Probar conexión" button. */
export async function fetchPageInfo(params: {
  pageId: string;
  pageAccessToken: string;
  igAccountId?: string | null;
}): Promise<{ pageName: string; igUsername: string | null }> {
  const page = await graphFetch(`/${params.pageId}?fields=name`, {
    accessToken: params.pageAccessToken,
  });
  let igUsername: string | null = null;
  if (params.igAccountId) {
    try {
      const ig = await graphFetch(
        `/${params.igAccountId}?fields=username`,
        { accessToken: params.pageAccessToken },
      );
      igUsername = typeof ig.username === "string" ? ig.username : null;
    } catch {
      igUsername = null;
    }
  }
  return {
    pageName: typeof page.name === "string" ? page.name : params.pageId,
    igUsername,
  };
}
