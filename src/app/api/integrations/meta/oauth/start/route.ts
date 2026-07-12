import { type NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { requireWorkspaceMember } from "@/lib/auth/workspace-access";
import { buildOAuthDialogUrl } from "@/features/inbox/services/meta-client";

/**
 * GET /api/integrations/meta/oauth/start?wsid=<workspace_id>
 *
 * Starts the centralized OAuth flow: admin-only, generates a nonce stored in a
 * short-lived httpOnly cookie, encodes {wsid, nonce} in the `state` parameter,
 * and redirects to Meta's OAuth dialog.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const wsid = request.nextUrl.searchParams.get("wsid");
  if (!wsid) {
    return NextResponse.json({ error: "Missing wsid" }, { status: 400 });
  }

  // Admin gate — only workspace managers+ can connect integrations.
  const auth = await requireWorkspaceMember(wsid, { minRole: "manager" });
  if (!auth.ok) return auth.response;

  // Generate a cryptographic nonce for CSRF protection (constant-time
  // comparison in the callback). 10-minute expiry.
  const nonce = randomBytes(32).toString("hex");

  const state = Buffer.from(JSON.stringify({ wsid, nonce })).toString(
    "base64url",
  );

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const redirectUri = `${appUrl}/api/integrations/meta/oauth/callback`;

  const dialogUrl = buildOAuthDialogUrl({ redirectUri, state });

  // Store nonce in a short-lived httpOnly cookie (not accessible to JS).
  const cookieStore = await cookies();
  cookieStore.set("meta_oauth_nonce", nonce, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600, // 10 minutes
    path: "/api/integrations/meta/oauth",
  });

  return NextResponse.redirect(dialogUrl);
}
