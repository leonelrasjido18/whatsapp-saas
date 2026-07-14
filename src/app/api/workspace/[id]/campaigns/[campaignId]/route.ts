// Campaign detail — GET (with recipient breakdown), PATCH (state transitions:
// launch / pause / resume / schedule), DELETE. Launching enforces the plan's
// monthly recipient quota.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createSvcClient } from "@supabase/supabase-js";
import {
  requireWorkspaceMember,
  requireWorkspaceFeature,
  readJsonBody,
} from "@/lib/auth/workspace-access";
import {
  getCampaign,
  setCampaignStatus,
  deleteCampaign,
  recipientsSentThisMonth,
} from "@/features/campaigns/services/campaigns";
import { countAudience } from "@/features/campaigns/services/segments";
import { getCampaignMonthlyLimit, type PlanTier } from "@/features/billing/plans";

function svc() {
  return createSvcClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; campaignId: string }> },
) {
  const { id: workspaceId, campaignId } = await params;

  const auth = await requireWorkspaceMember(workspaceId);
  if (!auth.ok) return auth.response;

  const db = svc();
  const campaign = await getCampaign(db, workspaceId, campaignId);
  if (!campaign) {
    return NextResponse.json({ error: "Campaña no encontrada" }, { status: 404 });
  }

  return NextResponse.json({ data: campaign });
}

const PatchSchema = z.object({
  action: z.enum(["launch", "pause", "resume", "schedule"]),
  scheduled_at: z.string().datetime().nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; campaignId: string }> },
) {
  const { id: workspaceId, campaignId } = await params;

  const auth = await requireWorkspaceMember(workspaceId, { minRole: "manager" });
  if (!auth.ok) return auth.response;

  const feat = await requireWorkspaceFeature(workspaceId, "campaigns");
  if (!feat.ok) return feat.response;

  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.response;

  const body = PatchSchema.safeParse(parsed.body);
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  const db = svc();
  const campaign = await getCampaign(db, workspaceId, campaignId);
  if (!campaign) {
    return NextResponse.json({ error: "Campaña no encontrada" }, { status: 404 });
  }

  try {
    if (body.data.action === "launch" || body.data.action === "resume") {
      // Enforce the monthly quota against this campaign's audience.
      const [audience, used, wsRow] = await Promise.all([
        countAudience(db, workspaceId, campaign.segment),
        recipientsSentThisMonth(db, workspaceId),
        db.from("workspaces").select("plan_tier").eq("id", workspaceId).single(),
      ]);
      const tier = (wsRow.data?.plan_tier as PlanTier) ?? "starter";
      const remaining = Math.max(0, getCampaignMonthlyLimit(tier) - used);

      if (body.data.action === "launch" && audience > remaining) {
        return NextResponse.json(
          {
            error: `La audiencia (${audience}) supera tu cupo mensual restante (${remaining}). Segmentá más o subí de plan.`,
          },
          { status: 403 },
        );
      }

      const updated = await setCampaignStatus(
        db,
        workspaceId,
        campaignId,
        "sending",
      );
      return NextResponse.json({ data: updated });
    }

    if (body.data.action === "pause") {
      const updated = await setCampaignStatus(db, workspaceId, campaignId, "paused");
      return NextResponse.json({ data: updated });
    }

    // schedule
    const updated = await setCampaignStatus(
      db,
      workspaceId,
      campaignId,
      "scheduled",
      body.data.scheduled_at ?? null,
    );
    return NextResponse.json({ data: updated });
  } catch (err) {
    console.error("[PATCH campaign]:", err);
    return NextResponse.json({ error: "Error al actualizar la campaña" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; campaignId: string }> },
) {
  const { id: workspaceId, campaignId } = await params;

  const auth = await requireWorkspaceMember(workspaceId, { minRole: "manager" });
  if (!auth.ok) return auth.response;

  try {
    await deleteCampaign(svc(), workspaceId, campaignId);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE campaign]:", err);
    return NextResponse.json({ error: "Error al eliminar la campaña" }, { status: 500 });
  }
}
