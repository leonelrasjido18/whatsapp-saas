// Public webchat polling endpoint — the widget fetches new messages for its
// session since a timestamp. Returns both directions so the visitor sees their
// own message echoed plus the agent's replies.

import { type NextRequest, NextResponse } from "next/server";
import { createClient as createSbClient } from "@supabase/supabase-js";

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function corsHeaders(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(req.headers.get("origin")),
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ publicKey: string }> },
) {
  const { publicKey } = await params;
  const headers = corsHeaders(req.headers.get("origin"));

  const sessionId = req.nextUrl.searchParams.get("sessionId")?.trim();
  const since = req.nextUrl.searchParams.get("since");
  if (!sessionId) {
    return NextResponse.json({ error: "Falta sessionId" }, { status: 400, headers });
  }

  const supabase = svc();

  const { data: settings } = await supabase
    .from("webchat_settings")
    .select("workspace_id, enabled")
    .eq("public_key", publicKey)
    .maybeSingle();

  if (!settings || !settings.enabled) {
    return NextResponse.json({ error: "Widget no disponible" }, { status: 404, headers });
  }

  const workspaceId = settings.workspace_id as string;

  // Resolve the contact/conversation for this session.
  const { data: contact } = await supabase
    .from("contacts")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("channel", "webchat")
    .eq("external_id", `webchat:${sessionId}`)
    .maybeSingle();

  if (!contact) {
    return NextResponse.json({ data: [] }, { headers });
  }

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("contact_id", contact.id)
    .eq("channel", "webchat")
    .maybeSingle();

  if (!conversation) {
    return NextResponse.json({ data: [] }, { headers });
  }

  let query = supabase
    .from("messages")
    .select("id, direction, body, created_at")
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: true })
    .limit(100);

  if (since) {
    query = query.gt("created_at", since);
  }

  const { data: messages } = await query;

  return NextResponse.json(
    {
      data: (messages ?? []).map((m) => ({
        id: m.id,
        direction: m.direction,
        body: m.body,
        created_at: m.created_at,
      })),
    },
    { headers },
  );
}
