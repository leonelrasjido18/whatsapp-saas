import { type NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { timingSafeEqual } from "node:crypto";
import { createClient as svcClient } from "@supabase/supabase-js";
import { requireWorkspaceMember } from "@/lib/auth/workspace-access";
import {
  exchangeCodeForToken,
  getLongLivedUserToken,
  listPagesWithInstagram,
} from "@/features/inbox/services/meta-client";

/**
 * GET /api/integrations/meta/oauth/callback
 *
 * Meta redirects here after the user completes (or cancels) the OAuth dialog.
 * Flow: validate state + nonce → exchange code → long-lived user token →
 * list pages + IG → upsert integration (pending_selection) → redirect to
 * Settings with ?meta=select_page.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const settingsUrl = `${appUrl}/settings`;

  // User cancelled the dialog
  const error = request.nextUrl.searchParams.get("error");
  if (error) {
    return NextResponse.redirect(
      `${settingsUrl}?meta_error=${encodeURIComponent(error)}`,
    );
  }

  const code = request.nextUrl.searchParams.get("code");
  const stateParam = request.nextUrl.searchParams.get("state");
  if (!code || !stateParam) {
    return NextResponse.redirect(`${settingsUrl}?meta_error=missing_params`);
  }

  // Decode state
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
    return NextResponse.redirect(`${settingsUrl}?meta_error=invalid_state`);
  }

  // Validate nonce against the cookie (constant-time comparison)
  const cookieStore = await cookies();
  const storedNonce = cookieStore.get("meta_oauth_nonce")?.value ?? "";
  cookieStore.delete("meta_oauth_nonce");

  if (!storedNonce) {
    return NextResponse.redirect(
      `${settingsUrl}?meta_error=nonce_expired`,
    );
  }

  try {
    const a = Buffer.from(nonce.padEnd(storedNonce.length, "0"), "utf8");
    const b = Buffer.from(storedNonce.padEnd(nonce.length, "0"), "utf8");
    const len = Math.max(a.length, b.length);
    const aBuf = Buffer.alloc(len);
    const bBuf = Buffer.alloc(len);
    a.copy(aBuf);
    b.copy(bBuf);
    if (!timingSafeEqual(aBuf, bBuf) || nonce.length !== storedNonce.length) {
      return NextResponse.redirect(
        `${settingsUrl}?meta_error=nonce_mismatch`,
      );
    }
  } catch {
    return NextResponse.redirect(
      `${settingsUrl}?meta_error=nonce_validation`,
    );
  }

  // Re-verify workspace membership (the middleware doesn't cover /api/)
  const auth = await requireWorkspaceMember(wsid, { minRole: "manager" });
  if (!auth.ok) {
    return NextResponse.redirect(`${settingsUrl}?meta_error=forbidden`);
  }

  const redirectUri = `${appUrl}/api/integrations/meta/oauth/callback`;

  try {
    // Exchange code → short-lived token → long-lived user token
    const shortToken = await exchangeCodeForToken({ code, redirectUri });
    const { token: userToken, expiresAt } =
      await getLongLivedUserToken(shortToken);

    // List pages the user manages (with page tokens + linked IG accounts)
    const candidates = await listPagesWithInstagram(userToken);

    if (candidates.length === 0) {
      return NextResponse.redirect(
        `${settingsUrl}?meta_error=no_pages`,
      );
    }

    // Upsert the integration in "pending selection" state
    const svc = svcClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    await svc.from("integrations").upsert(
      {
        workspace_id: wsid,
        provider: "meta",
        enabled: false,
        credentials: {},
        oauth_tokens: {
          user_token: userToken,
          user_token_expires_at: expiresAt,
          candidates: JSON.stringify(candidates),
        },
        config: { pending_selection: true },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id,provider" },
    );

    return NextResponse.redirect(`${settingsUrl}?meta=select_page`);
  } catch (err) {
    console.error(
      "[meta-oauth] callback error:",
      err instanceof Error ? err.message : "unknown",
    );
    return NextResponse.redirect(
      `${settingsUrl}?meta_error=oauth_failed`,
    );
  }
}
