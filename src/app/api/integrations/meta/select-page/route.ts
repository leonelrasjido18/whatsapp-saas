import { type NextRequest, NextResponse } from "next/server";
import { createClient as svcClient } from "@supabase/supabase-js";
import {
  requireWorkspaceMember,
  readJsonBody,
} from "@/lib/auth/workspace-access";
import {
  subscribePageToWebhooks,
  type MetaPageCandidate,
} from "@/features/inbox/services/meta-client";

/**
 * POST /api/integrations/meta/select-page
 * Body: { workspaceId, pageId }
 *
 * Called after the user picks a page from the candidates list.
 * Subscribes the app to the page's webhook events, stores the page access
 * token + config, enables the integration, and discards candidate data.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const { workspaceId, pageId } = parsedBody.body as {
    workspaceId?: string;
    pageId?: string;
  };

  if (!workspaceId || !pageId) {
    return NextResponse.json(
      { error: "workspaceId and pageId are required" },
      { status: 400 },
    );
  }

  const auth = await requireWorkspaceMember(workspaceId, {
    minRole: "manager",
  });
  if (!auth.ok) return auth.response;

  const svc = svcClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Load the pending integration with candidate tokens
  const { data: integration } = await svc
    .from("integrations")
    .select("oauth_tokens, config")
    .eq("workspace_id", workspaceId)
    .eq("provider", "meta")
    .maybeSingle();

  if (!integration) {
    return NextResponse.json(
      { error: "No Meta integration found — start the OAuth flow first" },
      { status: 404 },
    );
  }

  const oauthTokens = integration.oauth_tokens as Record<string, unknown>;
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
    return NextResponse.json(
      { error: "No page candidates available" },
      { status: 400 },
    );
  }

  const selected = candidates.find((c) => c.pageId === pageId);
  if (!selected) {
    return NextResponse.json(
      { error: "Selected page not found in candidates" },
      { status: 400 },
    );
  }

  try {
    // Subscribe the app to the page's webhook events
    await subscribePageToWebhooks({
      pageId: selected.pageId,
      pageAccessToken: selected.pageAccessToken,
    });
  } catch (err) {
    console.error(
      "[meta-select-page] subscribe failed:",
      err instanceof Error ? err.message : "unknown",
    );
    return NextResponse.json(
      { error: "Failed to subscribe page to webhooks" },
      { status: 500 },
    );
  }

  // Store the selected page's token and config, enable the integration,
  // and discard the candidate data (it contains other pages' tokens).
  const { error: updateError } = await svc
    .from("integrations")
    .update({
      enabled: true,
      credentials: {
        page_access_token: selected.pageAccessToken,
      },
      oauth_tokens: {
        user_token: oauthTokens.user_token,
        user_token_expires_at: oauthTokens.user_token_expires_at,
        // candidates discarded — only the selected page's token is kept
      },
      config: {
        // Preserve workspace prefs (buffer_silence_seconds, etc.) across
        // (re)connections; identity keys below overwrite the old page.
        ...((integration.config as object) ?? {}),
        page_id: selected.pageId,
        page_name: selected.name,
        ig_account_id: selected.igAccountId,
        ig_username: selected.igUsername,
        pending_selection: false,
        reconnect_required: false,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("workspace_id", workspaceId)
    .eq("provider", "meta");

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
