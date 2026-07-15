import { type NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { timingSafeEqual } from "node:crypto";
import { createClient as svcClient } from "@supabase/supabase-js";
import {
  exchangeCodeForTokens,
  storeMpTokens,
} from "@/features/commerce/services/mercadopago-oauth";

/**
 * GET /api/integrations/mercadopago/callback
 *
 * MercadoPago redirects here after the merchant authorizes (or cancels).
 * Validates state + nonce, exchanges the code for tokens, stores them on the
 * workspace's mercadopago integration, and returns to Settings.
 *
 * Public route (the browser lands here from MP), so the workspace is carried in
 * the signed `state`, and the nonce cookie proves the flow started with us.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const settingsUrl = `${appUrl}/settings`;

  const error = request.nextUrl.searchParams.get("error");
  if (error) {
    return NextResponse.redirect(
      `${settingsUrl}?mp_error=${encodeURIComponent(error)}`,
    );
  }

  const code = request.nextUrl.searchParams.get("code");
  const stateParam = request.nextUrl.searchParams.get("state");
  if (!code || !stateParam) {
    return NextResponse.redirect(`${settingsUrl}?mp_error=missing_params`);
  }

  let wsid: string;
  let nonce: string;
  try {
    const parsed = JSON.parse(
      Buffer.from(stateParam, "base64url").toString("utf8"),
    );
    wsid = parsed.wsid;
    nonce = parsed.nonce;
    if (!wsid || !nonce) throw new Error("incomplete");
  } catch {
    return NextResponse.redirect(`${settingsUrl}?mp_error=invalid_state`);
  }

  // CSRF: constant-time compare the state nonce against the cookie.
  const cookieStore = await cookies();
  const storedNonce = cookieStore.get("mp_oauth_nonce")?.value ?? "";
  cookieStore.delete("mp_oauth_nonce");

  if (
    !storedNonce ||
    storedNonce.length !== nonce.length ||
    !timingSafeEqual(Buffer.from(storedNonce), Buffer.from(nonce))
  ) {
    return NextResponse.redirect(`${settingsUrl}?mp_error=nonce_mismatch`);
  }

  const redirectUri = `${appUrl}/api/integrations/mercadopago/callback`;

  try {
    const tokens = await exchangeCodeForTokens(code, redirectUri);
    const supabase = svcClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    await storeMpTokens(supabase, wsid, tokens);
    return NextResponse.redirect(`${settingsUrl}?mp=connected`);
  } catch (err) {
    console.error("[mp-oauth callback]:", err instanceof Error ? err.message : err);
    return NextResponse.redirect(`${settingsUrl}?mp_error=exchange_failed`);
  }
}
