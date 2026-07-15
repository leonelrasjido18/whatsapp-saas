import { type NextRequest, NextResponse } from "next/server";
import { createClient as svcClient } from "@supabase/supabase-js";
import { requireWorkspaceMember } from "@/lib/auth/workspace-access";
import { disconnectMp } from "@/features/commerce/services/mercadopago-oauth";

/**
 * POST /api/integrations/mercadopago/disconnect?wsid=<workspace_id>
 * Admin-only. Clears the workspace's MercadoPago OAuth tokens.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const wsid = request.nextUrl.searchParams.get("wsid");
  if (!wsid) {
    return NextResponse.json({ error: "Missing wsid" }, { status: 400 });
  }

  const auth = await requireWorkspaceMember(wsid, { minRole: "manager" });
  if (!auth.ok) return auth.response;

  const supabase = svcClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  await disconnectMp(supabase, wsid);

  return NextResponse.json({ ok: true });
}
