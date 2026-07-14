// Google review settings — GET/PUT for a workspace. Gated on the
// automation_rules plan feature (Pro+), matching the plan's positioning.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createSvcClient } from "@supabase/supabase-js";
import {
  requireWorkspaceMember,
  requireWorkspaceFeature,
  readJsonBody,
} from "@/lib/auth/workspace-access";
import {
  getReviewSettings,
  upsertReviewSettings,
} from "@/features/commerce/services/reviews";

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

  const settings = await getReviewSettings(svc(), workspaceId);
  return NextResponse.json({
    data:
      settings ?? {
        workspace_id: workspaceId,
        enabled: false,
        review_url: null,
        delay_hours: 24,
        template_name: null,
        requests_sent: 0,
        clicks: 0,
      },
  });
}

const UpdateSchema = z.object({
  enabled: z.boolean().optional(),
  review_url: z.string().url().max(1000).nullable().optional(),
  delay_hours: z.number().int().min(1).max(168).optional(),
  template_name: z.string().max(200).nullable().optional(),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;

  const auth = await requireWorkspaceMember(workspaceId, { minRole: "manager" });
  if (!auth.ok) return auth.response;

  const feat = await requireWorkspaceFeature(workspaceId, "automation_rules");
  if (!feat.ok) return feat.response;

  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.response;

  const body = UpdateSchema.safeParse(parsed.body);
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  // Enabling requires a review URL to be present (either in this update or already saved).
  if (body.data.enabled) {
    const incomingUrl = body.data.review_url;
    if (incomingUrl === null || incomingUrl === "") {
      return NextResponse.json(
        { error: "Necesitás un enlace de reseña para activar esta función" },
        { status: 400 },
      );
    }
    if (incomingUrl === undefined) {
      const existing = await getReviewSettings(svc(), workspaceId);
      if (!existing?.review_url) {
        return NextResponse.json(
          { error: "Necesitás un enlace de reseña para activar esta función" },
          { status: 400 },
        );
      }
    }
  }

  try {
    const settings = await upsertReviewSettings(svc(), workspaceId, body.data);
    return NextResponse.json({ data: settings });
  } catch (err) {
    console.error("[PUT reviews]:", err);
    return NextResponse.json(
      { error: "Error al guardar la configuración" },
      { status: 500 },
    );
  }
}
