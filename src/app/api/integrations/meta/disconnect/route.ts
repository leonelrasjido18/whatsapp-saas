import { type NextRequest, NextResponse } from "next/server";
import { createClient as svcClient } from "@supabase/supabase-js";
import {
  requireWorkspaceMember,
  readJsonBody,
} from "@/lib/auth/workspace-access";
import { unsubscribePageFromWebhooks } from "@/features/inbox/services/meta-client";

/**
 * POST /api/integrations/meta/disconnect
 * Body: { workspaceId }
 *
 * Disconnects the Meta integration: unsubscribes from webhooks (best-effort),
 * disables the integration, and clears credentials. Conversation history is
 * preserved.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const { workspaceId } = parsedBody.body as { workspaceId?: string };
  if (!workspaceId) {
    return NextResponse.json(
      { error: "workspaceId is required" },
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

  // Load current integration to get page token for unsubscribe
  const { data: integration } = await svc
    .from("integrations")
    .select("credentials, config")
    .eq("workspace_id", workspaceId)
    .eq("provider", "meta")
    .maybeSingle();

  if (integration) {
    const creds = integration.credentials as Record<string, unknown> | null;
    const config = integration.config as Record<string, unknown> | null;
    const pageId = typeof config?.page_id === "string" ? config.page_id : "";
    const pageAccessToken =
      typeof creds?.page_access_token === "string"
        ? creds.page_access_token
        : "";

    // Best-effort unsubscribe — never throws
    if (pageId && pageAccessToken) {
      await unsubscribePageFromWebhooks({ pageId, pageAccessToken });
    }
  }

  // Disable and clear credentials (conversation history is preserved)
  const { error } = await svc
    .from("integrations")
    .update({
      enabled: false,
      credentials: {},
      oauth_tokens: {},
      config: {},
      updated_at: new Date().toISOString(),
    })
    .eq("workspace_id", workspaceId)
    .eq("provider", "meta");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
