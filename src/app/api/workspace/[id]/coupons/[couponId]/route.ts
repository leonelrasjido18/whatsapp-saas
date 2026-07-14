import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createSvcClient } from "@supabase/supabase-js";
import {
  requireWorkspaceMember,
  readJsonBody,
} from "@/lib/auth/workspace-access";

function svc() {
  return createSvcClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const PatchSchema = z.object({ active: z.boolean() });

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; couponId: string }> },
) {
  const { id: workspaceId, couponId } = await params;
  const auth = await requireWorkspaceMember(workspaceId, { minRole: "manager" });
  if (!auth.ok) return auth.response;

  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.response;
  const body = PatchSchema.safeParse(parsed.body);
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  const { error } = await svc()
    .from("coupons")
    .update({ active: body.data.active })
    .eq("workspace_id", workspaceId)
    .eq("id", couponId);

  if (error) {
    return NextResponse.json({ error: "Error al actualizar" }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; couponId: string }> },
) {
  const { id: workspaceId, couponId } = await params;
  const auth = await requireWorkspaceMember(workspaceId, { minRole: "manager" });
  if (!auth.ok) return auth.response;

  const { error } = await svc()
    .from("coupons")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("id", couponId);

  if (error) {
    return NextResponse.json({ error: "Error al eliminar" }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
