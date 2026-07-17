// google-calendar.ts — #14 sync de turnos con Google Calendar. OAuth + creación
// de eventos vía la API REST (sin dependencias extra). Guarda los tokens en la
// integración 'google_calendar' del workspace.
//
// REQUISITO: setear GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET (Google Cloud → OAuth).
// Redirect URI autorizado: {APP_URL}/api/integrations/google/callback

import { createClient as createSbClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getBaseUrl } from "@/lib/utils";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/calendar.events";

function svc(): SupabaseClient {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export function isGoogleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function redirectUri(): string {
  return `${getBaseUrl()}/api/integrations/google/callback`;
}

/** Consent URL. `state` carries the workspace id (validated in the callback). */
export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
}

export async function exchangeCode(code: string): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed (${res.status})`);
  return (await res.json()) as TokenResponse;
}

export async function storeGoogleTokens(
  workspaceId: string,
  tokens: TokenResponse,
): Promise<void> {
  const supabase = svc();
  const expiry = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    : null;
  await supabase.from("integrations").upsert(
    {
      workspace_id: workspaceId,
      provider: "google_calendar",
      enabled: true,
      oauth_tokens: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expiry,
      },
      config: {},
    },
    { onConflict: "workspace_id,provider" },
  );
}

/** Returns a valid access token, refreshing if needed. Null when not connected. */
async function getValidAccessToken(workspaceId: string): Promise<string | null> {
  const supabase = svc();
  const { data } = await supabase
    .from("integrations")
    .select("oauth_tokens")
    .eq("workspace_id", workspaceId)
    .eq("provider", "google_calendar")
    .maybeSingle();

  const tokens = data?.oauth_tokens as
    | { access_token?: string; refresh_token?: string; expiry?: string | null }
    | null;
  if (!tokens?.refresh_token) return tokens?.access_token ?? null;

  const stillValid =
    tokens.access_token &&
    tokens.expiry &&
    new Date(tokens.expiry).getTime() - Date.now() > 60_000;
  if (stillValid) return tokens.access_token!;

  // Refresh.
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: tokens.refresh_token,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) return null;
  const refreshed = (await res.json()) as TokenResponse;
  const expiry = refreshed.expires_in
    ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
    : null;
  await supabase
    .from("integrations")
    .update({
      oauth_tokens: {
        access_token: refreshed.access_token,
        refresh_token: tokens.refresh_token,
        expiry,
      },
    })
    .eq("workspace_id", workspaceId)
    .eq("provider", "google_calendar");
  return refreshed.access_token ?? null;
}

/**
 * Creates a Calendar event for a booking. Best-effort — returns false on any
 * failure so booking never breaks. No-op when the workspace isn't connected.
 */
export async function pushBookingToCalendar(
  workspaceId: string,
  booking: { startsAt: string; endsAt: string; summary: string; description?: string },
): Promise<boolean> {
  if (!isGoogleConfigured()) return false;
  try {
    const token = await getValidAccessToken(workspaceId);
    if (!token) return false;

    const res = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          summary: booking.summary,
          description: booking.description ?? "",
          start: { dateTime: booking.startsAt },
          end: { dateTime: booking.endsAt },
        }),
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}
