// Storefront (#2) settings — GET/PUT. Manager+ only.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createSvcClient } from "@supabase/supabase-js";
import {
  requireWorkspaceMember,
  readJsonBody,
} from "@/lib/auth/workspace-access";
import {
  getOrCreateStorefrontSettings,
  updateStorefrontSettings,
} from "@/features/storefront/services/storefront";

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
    const settings = await getOrCreateStorefrontSettings(svc(), workspaceId);
    return NextResponse.json({ data: settings });
  } catch (err) {
    console.error("[GET storefront]:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

const UpdateSchema = z.object({
  enabled: z.boolean().optional(),
  headline: z.string().max(200).nullable().optional(),
  subheadline: z.string().max(300).nullable().optional(),
  whatsapp_phone: z.string().max(30).nullable().optional(),
  accent_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  show_prices: z.boolean().optional(),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;
  const auth = await requireWorkspaceMember(workspaceId, { minRole: "manager" });
  if (!auth.ok) return auth.response;

  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.response;

  const body = UpdateSchema.safeParse(parsed.body);
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  try {
    const settings = await updateStorefrontSettings(
      svc(),
      workspaceId,
      body.data,
    );
    return NextResponse.json({ data: settings });
  } catch (err) {
    console.error("[PUT storefront]:", err);
    return NextResponse.json({ error: "Error al guardar" }, { status: 500 });
  }
}
