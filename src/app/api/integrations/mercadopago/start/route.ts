import { type NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { requireWorkspaceMember } from "@/lib/auth/workspace-access";
import {
  buildAuthorizationUrl,
  isMpOAuthConfigured,
} from "@/features/commerce/services/mercadopago-oauth";

/**
 * GET /api/integrations/mercadopago/start?wsid=<workspace_id>
 *
 * Admin-only. Generates a CSRF nonce (httpOnly cookie), encodes {wsid, nonce}
 * in `state`, and redirects the merchant to MercadoPago's authorization screen.
 * The redirect_uri must match exactly what's registered in the MP app:
 *   {APP_URL}/api/integrations/mercadopago/callback
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const wsid = request.nextUrl.searchParams.get("wsid");
  if (!wsid) {
    return NextResponse.json({ error: "Missing wsid" }, { status: 400 });
  }

  const auth = await requireWorkspaceMember(wsid, { minRole: "manager" });
  if (!auth.ok) return auth.response;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  if (!isMpOAuthConfigured()) {
    return NextResponse.redirect(`${appUrl}/settings?mp_error=not_configured`);
  }

  const nonce = randomBytes(32).toString("hex");
  const state = Buffer.from(JSON.stringify({ wsid, nonce })).toString(
    "base64url",
  );

  const redirectUri = `${appUrl}/api/integrations/mercadopago/callback`;
  const authUrl = buildAuthorizationUrl(redirectUri, state);

  const cookieStore = await cookies();
  cookieStore.set("mp_oauth_nonce", nonce, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600, // 10 minutes
    path: "/api/integrations/mercadopago",
  });

  return NextResponse.redirect(authUrl);
}
