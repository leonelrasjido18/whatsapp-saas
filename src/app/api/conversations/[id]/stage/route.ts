// Sales-pipeline stage of a conversation: read + manual override from the inbox.
// Access is gated by RLS (the user-context client only sees conversations in the
// caller's workspaces); the write uses the service role after that check.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createClient as svcClient } from "@supabase/supabase-js";

function svc() {
  return svcClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function loadConversation(conversationId: string) {
  // RLS-respecting read: returns null when the caller isn't a member.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autorizado" as const, status: 401 };

  const { data: conv } = await supabase
    .from("conversations")
    .select("id, workspace_id, pipeline_stage")
    .eq("id", conversationId)
    .maybeSingle();

  if (!conv) return { error: "Conversación no encontrada" as const, status: 404 };
  return { conv, userId: user.id };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: conversationId } = await params;
  const res = await loadConversation(conversationId);
  if ("error" in res) {
    return NextResponse.json({ error: res.error }, { status: res.status });
  }

  const { data: ws } = await svc()
    .from("workspaces")
    .select("sales_pipeline_enabled")
    .eq("id", res.conv.workspace_id)
    .maybeSingle();

  return NextResponse.json({
    enabled: Boolean(ws?.sales_pipeline_enabled),
    stage: (res.conv.pipeline_stage as string | null) ?? "setter",
  });
}

const PatchSchema = z.object({
  stage: z.enum(["setter", "soporte", "agendamiento"]),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: conversationId } = await params;
  const res = await loadConversation(conversationId);
  if ("error" in res) {
    return NextResponse.json({ error: res.error }, { status: res.status });
  }

  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Etapa inválida" }, { status: 400 });
  }

  const { error } = await svc()
    .from("conversations")
    .update({ pipeline_stage: parsed.data.stage })
    .eq("id", conversationId)
    .eq("workspace_id", res.conv.workspace_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Best-effort audit trail.
  await svc()
    .from("events")
    .insert({
      workspace_id: res.conv.workspace_id,
      conversation_id: conversationId,
      type: "pipeline_stage_changed",
      payload: {
        to: parsed.data.stage,
        from: res.conv.pipeline_stage ?? null,
        source: "manual",
        by: res.userId,
      },
    })
    .then(
      () => {},
      () => {},
    );

  return NextResponse.json({ ok: true, stage: parsed.data.stage });
}
