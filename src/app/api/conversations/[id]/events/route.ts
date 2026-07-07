// F8-D2: GET /api/conversations/[id]/events
// Returns metrics + last 20 events for a conversation.
// Auth required. Verifies conversation belongs to user's workspace.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getConversationMetrics,
  getConversationEvents,
} from "@/features/inbox/services/observability";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    // 1. Auth
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id: conversationId } = await params;

    // 2. Resolve user workspace
    const { data: member, error: memberError } = await supabase
      .from("memberships")
      .select("workspace_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (memberError || !member) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // 3. Verify the conversation belongs to the user's workspace
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("id, workspace_id")
      .eq("id", conversationId)
      .eq("workspace_id", member.workspace_id)
      .single();

    if (convError || !conversation) {
      return NextResponse.json(
        { error: "Conversación no encontrada" },
        { status: 404 },
      );
    }

    // 4. Fetch metrics and events
    const [metrics, events] = await Promise.all([
      getConversationMetrics(conversationId),
      getConversationEvents(conversationId, 20),
    ]);

    return NextResponse.json({ metrics, events });
  } catch (err) {
    console.error(
      "[GET /api/conversations/[id]/events]:",
      err instanceof Error ? err.message : "unknown error",
    );
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }
}
