import { type NextRequest, NextResponse } from "next/server";
import { createClient as svcClient } from "@supabase/supabase-js";
import { requireWorkspaceMember } from "@/lib/auth/workspace-access";
import type { MetaPageCandidate } from "@/features/inbox/services/meta-client";

/**
 * GET /api/integrations/meta/pages?wsid=<workspace_id>
 *
 * Returns the page candidates stored during the OAuth flow — sanitized without
 * tokens. Used by the Settings UI to render the page-selection radio list.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const wsid = request.nextUrl.searchParams.get("wsid");
  if (!wsid) {
    return NextResponse.json({ error: "Missing wsid" }, { status: 400 });
  }

  const auth = await requireWorkspaceMember(wsid);
  if (!auth.ok) return auth.response;

  const svc = svcClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data } = await svc
    .from("integrations")
    .select("oauth_tokens, config")
    .eq("workspace_id", wsid)
    .eq("provider", "meta")
    .maybeSingle();

  if (!data) {
    return NextResponse.json({ pages: [] });
  }

  const oauthTokens = data.oauth_tokens as Record<string, unknown> | null;
  let candidates: MetaPageCandidate[] = [];
  try {
    const raw = oauthTokens?.candidates;
    candidates =
      typeof raw === "string"
        ? (JSON.parse(raw) as MetaPageCandidate[])
        : Array.isArray(raw)
          ? (raw as MetaPageCandidate[])
          : [];
  } catch {
    candidates = [];
  }

  // Sanitize: never expose tokens to the frontend
  const pages = candidates.map((c) => ({
    pageId: c.pageId,
    name: c.name,
    igAccountId: c.igAccountId,
    igUsername: c.igUsername,
  }));

  return NextResponse.json({ pages });
}
