import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient as svcClient } from "@supabase/supabase-js";
import {
  requireWorkspaceMember,
  readJsonBody,
} from "@/lib/auth/workspace-access";

// GET   /api/workspace/[id]/pipeline → { enabled }
// PATCH /api/workspace/[id]/pipeline → toggle the sales pipeline (admin/manager)

function svc() {
  return svcClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;
  const auth = await requireWorkspaceMember(workspaceId);
  if (!auth.ok) return auth.response;

  const { data } = await svc()
    .from("workspaces")
    .select("sales_pipeline_enabled")
    .eq("id", workspaceId)
    .maybeSingle();

  return NextResponse.json({ enabled: Boolean(data?.sales_pipeline_enabled) });
}

const PatchSchema = z.object({ enabled: z.boolean() });

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;
  const auth = await requireWorkspaceMember(workspaceId, { minRole: "manager" });
  if (!auth.ok) return auth.response;

  const parsedBody = await readJsonBody(req);
  if (!parsedBody.ok) return parsedBody.response;
  const parsed = PatchSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const { error } = await svc()
    .from("workspaces")
    .update({ sales_pipeline_enabled: parsed.data.enabled })
    .eq("id", workspaceId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, enabled: parsed.data.enabled });
}
