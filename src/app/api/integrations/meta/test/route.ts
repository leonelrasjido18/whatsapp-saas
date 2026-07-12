import { type NextRequest, NextResponse } from "next/server";
import { createClient as svcClient } from "@supabase/supabase-js";
import {
  requireWorkspaceMember,
  readJsonBody,
} from "@/lib/auth/workspace-access";
import { fetchPageInfo, isAuthError } from "@/features/inbox/services/meta-client";
import { flagMetaReconnectRequired } from "@/features/inbox/services/meta-integration";

/**
 * POST /api/integrations/meta/test
 * Body: { workspaceId }
 *
 * Tests the stored Meta page token by fetching the page name (and optionally
 * the IG username). On Graph error 190 (token invalid), flags the integration
 * for reconnection.
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

  const { data: integration } = await svc
    .from("integrations")
    .select("credentials, config")
    .eq("workspace_id", workspaceId)
    .eq("provider", "meta")
    .eq("enabled", true)
    .maybeSingle();

  if (!integration) {
    return NextResponse.json(
      { error: "Meta integration not found or disabled" },
      { status: 404 },
    );
  }

  const creds = integration.credentials as Record<string, unknown>;
  const config = integration.config as Record<string, unknown>;
  const pageId = typeof config?.page_id === "string" ? config.page_id : "";
  const pageAccessToken =
    typeof creds?.page_access_token === "string"
      ? creds.page_access_token
      : "";
  const igAccountId =
    typeof config?.ig_account_id === "string" ? config.ig_account_id : null;

  if (!pageId || !pageAccessToken) {
    return NextResponse.json(
      { error: "Incomplete integration — reconnect Facebook" },
      { status: 400 },
    );
  }

  try {
    const info = await fetchPageInfo({
      pageId,
      pageAccessToken,
      igAccountId,
    });

    return NextResponse.json({
      ok: true,
      pageName: info.pageName,
      igUsername: info.igUsername,
    });
  } catch (err) {
    if (isAuthError(err)) {
      await flagMetaReconnectRequired(workspaceId);
      return NextResponse.json(
        {
          ok: false,
          error: "Token inválido — reconecta Facebook en Configuración",
          reconnect_required: true,
        },
        { status: 401 },
      );
    }

    const errMsg = err instanceof Error ? err.message : "unknown";
    console.error("[meta-test] error:", errMsg);
    return NextResponse.json({ ok: false, error: errMsg }, { status: 500 });
  }
}
