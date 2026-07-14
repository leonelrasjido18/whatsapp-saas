// Campaigns — GET (list) / POST (create). Gated on the `campaigns` plan feature.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createSvcClient } from "@supabase/supabase-js";
import {
  requireWorkspaceMember,
  requireWorkspaceFeature,
  readJsonBody,
} from "@/lib/auth/workspace-access";
import {
  listCampaigns,
  createCampaign,
} from "@/features/campaigns/services/campaigns";

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
    const campaigns = await listCampaigns(svc(), workspaceId);
    return NextResponse.json({ data: campaigns });
  } catch (err) {
    console.error("[GET campaigns]:", err);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

const SegmentSchema = z.object({
  tags: z.array(z.string()).optional(),
  tiers: z.array(z.enum(["new", "regular", "vip", "inactive"])).optional(),
  inactiveDays: z.number().int().min(1).max(3650).optional(),
  hasPurchased: z.boolean().optional(),
  minSpent: z.number().min(0).optional(),
  birthdayThisMonth: z.boolean().optional(),
});

const CreateSchema = z.object({
  name: z.string().min(1).max(200),
  template_name: z.string().min(1).max(200),
  template_language: z.string().max(10).optional(),
  segment: SegmentSchema,
  scheduled_at: z.string().datetime().nullable().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;

  const auth = await requireWorkspaceMember(workspaceId, { minRole: "manager" });
  if (!auth.ok) return auth.response;

  const feat = await requireWorkspaceFeature(workspaceId, "campaigns");
  if (!feat.ok) return feat.response;

  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.response;

  const body = CreateSchema.safeParse(parsed.body);
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  try {
    const campaign = await createCampaign(svc(), workspaceId, {
      ...body.data,
      createdBy: auth.userId,
    });
    return NextResponse.json({ data: campaign }, { status: 201 });
  } catch (err) {
    console.error("[POST campaigns]:", err);
    return NextResponse.json({ error: "Error al crear la campaña" }, { status: 500 });
  }
}
