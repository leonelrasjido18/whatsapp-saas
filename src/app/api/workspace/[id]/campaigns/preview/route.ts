// Audience-size preview for a segment — used by the campaign wizard before the
// user commits. Also reports the workspace's remaining monthly campaign quota.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createSvcClient } from "@supabase/supabase-js";
import {
  requireWorkspaceMember,
  requireWorkspaceFeature,
  readJsonBody,
} from "@/lib/auth/workspace-access";
import { countAudience } from "@/features/campaigns/services/segments";
import { recipientsSentThisMonth } from "@/features/campaigns/services/campaigns";
import {
  getCampaignMonthlyLimit,
  type PlanTier,
} from "@/features/billing/plans";

function svc() {
  return createSvcClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const SegmentSchema = z.object({
  tags: z.array(z.string()).optional(),
  tiers: z.array(z.enum(["new", "regular", "vip", "inactive"])).optional(),
  inactiveDays: z.number().int().min(1).max(3650).optional(),
  hasPurchased: z.boolean().optional(),
  minSpent: z.number().min(0).optional(),
  birthdayThisMonth: z.boolean().optional(),
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

  const body = SegmentSchema.safeParse(parsed.body);
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  const db = svc();

  try {
    const [audienceSize, usedThisMonth, wsRow] = await Promise.all([
      countAudience(db, workspaceId, body.data),
      recipientsSentThisMonth(db, workspaceId),
      db.from("workspaces").select("plan_tier").eq("id", workspaceId).single(),
    ]);

    const tier = (wsRow.data?.plan_tier as PlanTier) ?? "starter";
    const monthlyLimit = getCampaignMonthlyLimit(tier);
    const remaining = Math.max(0, monthlyLimit - usedThisMonth);

    return NextResponse.json({
      data: {
        audienceSize,
        monthlyLimit,
        usedThisMonth,
        remaining,
        exceedsQuota: audienceSize > remaining,
      },
    });
  } catch (err) {
    console.error("[POST campaigns/preview]:", err);
    return NextResponse.json({ error: "Error al calcular la audiencia" }, { status: 500 });
  }
}
