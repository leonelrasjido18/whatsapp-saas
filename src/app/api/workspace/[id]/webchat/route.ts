// Webchat settings — GET/PUT. Gated on the knowledge_base plan feature as a
// Pro+ proxy (webchat is a Pro+ feature per the plan).

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createSvcClient } from "@supabase/supabase-js";
import {
  requireWorkspaceMember,
  requireWorkspaceFeature,
  readJsonBody,
} from "@/lib/auth/workspace-access";
import {
  getOrCreateWebchatSettings,
  updateWebchatSettings,
} from "@/features/settings/services/webchat";

function svc() {
  return createSvcClient(
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

  try {
    const settings = await getOrCreateWebchatSettings(svc(), workspaceId);
    return NextResponse.json({ data: settings });
  } catch (err) {
    console.error("[GET webchat]:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

const UpdateSchema = z.object({
  enabled: z.boolean().optional(),
  allowed_origin: z.string().url().max(500).nullable().optional(),
  title: z.string().max(120).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  welcome_message: z.string().max(500).nullable().optional(),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;

  const auth = await requireWorkspaceMember(workspaceId, { minRole: "manager" });
  if (!auth.ok) return auth.response;

  const feat = await requireWorkspaceFeature(workspaceId, "knowledge_base");
  if (!feat.ok) return feat.response;

  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.response;

  const body = UpdateSchema.safeParse(parsed.body);
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  try {
    const settings = await updateWebchatSettings(svc(), workspaceId, body.data);
    return NextResponse.json({ data: settings });
  } catch (err) {
    console.error("[PUT webchat]:", err);
    return NextResponse.json({ error: "Error al guardar" }, { status: 500 });
  }
}
