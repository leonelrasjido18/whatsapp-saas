// MercadoPago OAuth (marketplace "Vincular cuenta") — lets a merchant connect
// their own MP account with one click instead of pasting an access token. The
// platform registers ONE app (MP_CLIENT_ID / MP_CLIENT_SECRET); each workspace
// authorizes through it and we store their tokens in integrations.oauth_tokens.
//
// The obtained access_token is the merchant's own token and drives the same
// Preference/Payment APIs as the manual token — so getValidMpAccessToken() is
// the single accessor the payment code reads, transparently refreshing when the
// token is near expiry and falling back to a manually-pasted token for
// workspaces that connected the old way.

import type { SupabaseClient } from "@supabase/supabase-js";

const MP_AUTH_BASE = "https://auth.mercadopago.com.ar/authorization";
const MP_TOKEN_URL = "https://api.mercadopago.com/oauth/token";

// Refresh when the access token is within this window of expiring.
const REFRESH_SKEW_MS = 7 * 24 * 3600 * 1000; // 7 days

export interface MpOAuthTokens {
  access_token: string;
  refresh_token: string;
  user_id: string;
  public_key?: string;
  live_mode?: boolean;
  expires_at: string; // ISO — computed from expires_in at storage time
}

export function isMpOAuthConfigured(): boolean {
  return Boolean(process.env.MP_CLIENT_ID && process.env.MP_CLIENT_SECRET);
}

export function buildAuthorizationUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.MP_CLIENT_ID ?? "",
    response_type: "code",
    platform_id: "mp",
    state,
    redirect_uri: redirectUri,
  });
  return `${MP_AUTH_BASE}?${params.toString()}`;
}

interface RawTokenResponse {
  access_token: string;
  refresh_token: string;
  user_id: number | string;
  public_key?: string;
  live_mode?: boolean;
  expires_in?: number;
}

function toTokens(raw: RawTokenResponse): MpOAuthTokens {
  const expiresInMs = (raw.expires_in ?? 15552000) * 1000; // default ~180d
  return {
    access_token: raw.access_token,
    refresh_token: raw.refresh_token,
    user_id: String(raw.user_id),
    public_key: raw.public_key,
    live_mode: raw.live_mode,
    expires_at: new Date(Date.now() + expiresInMs).toISOString(),
  };
}

/** Exchanges the authorization code from the callback for tokens. */
export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
): Promise<MpOAuthTokens> {
  const res = await fetch(MP_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: process.env.MP_CLIENT_ID,
      client_secret: process.env.MP_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });
  const body = (await res.json()) as RawTokenResponse & { message?: string };
  if (!res.ok || !body.access_token) {
    throw new Error(body.message ?? `MP token exchange failed (${res.status})`);
  }
  return toTokens(body);
}

async function refreshTokens(refreshToken: string): Promise<MpOAuthTokens> {
  const res = await fetch(MP_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: process.env.MP_CLIENT_ID,
      client_secret: process.env.MP_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  const body = (await res.json()) as RawTokenResponse & { message?: string };
  if (!res.ok || !body.access_token) {
    throw new Error(body.message ?? `MP token refresh failed (${res.status})`);
  }
  return toTokens(body);
}

/** Persists the OAuth tokens on the workspace's mercadopago integration row. */
export async function storeMpTokens(
  supabase: SupabaseClient,
  workspaceId: string,
  tokens: MpOAuthTokens,
): Promise<void> {
  const { error } = await supabase
    .from("integrations")
    .upsert(
      {
        workspace_id: workspaceId,
        provider: "mercadopago",
        enabled: true,
        oauth_tokens: tokens,
      },
      { onConflict: "workspace_id,provider" },
    );
  if (error) throw error;
}

export async function disconnectMp(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<void> {
  await supabase
    .from("integrations")
    .update({ oauth_tokens: {} })
    .eq("workspace_id", workspaceId)
    .eq("provider", "mercadopago");
}

/**
 * Returns a usable MP access token for a workspace, or null when the workspace
 * has no MP connection. Prefers OAuth tokens (refreshing when near expiry);
 * falls back to a manually-pasted token for backward compatibility.
 */
export async function getValidMpAccessToken(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("integrations")
    .select("credentials, oauth_tokens")
    .eq("workspace_id", workspaceId)
    .eq("provider", "mercadopago")
    .maybeSingle();

  if (!data) return null;

  const oauth = data.oauth_tokens as Partial<MpOAuthTokens> | null;
  if (oauth?.access_token && oauth?.refresh_token && oauth?.expires_at) {
    const expiresAt = new Date(oauth.expires_at).getTime();
    if (expiresAt - Date.now() > REFRESH_SKEW_MS) {
      return oauth.access_token;
    }
    // Near/after expiry → refresh and persist.
    try {
      const refreshed = await refreshTokens(oauth.refresh_token);
      await storeMpTokens(supabase, workspaceId, refreshed);
      return refreshed.access_token;
    } catch (err) {
      console.error("[mp-oauth] refresh failed, using stale token:", err);
      return oauth.access_token; // stale but maybe still valid briefly
    }
  }

  // Fallback: manually-pasted token (legacy connection).
  const manual = (data.credentials as { mp_access_token?: string } | null)
    ?.mp_access_token;
  return manual && manual.length > 0 ? manual : null;
}

/** Whether the workspace is connected via OAuth (for the settings UI). */
export function hasOAuthConnection(
  oauthTokens: Record<string, unknown> | null | undefined,
): boolean {
  return Boolean(oauthTokens && Object.keys(oauthTokens).length > 0);
}
