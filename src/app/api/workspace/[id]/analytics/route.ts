// Analytics — conversion funnel + team productivity for the dashboard. Any member.

import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceMember } from "@/lib/auth/workspace-access";
import {
  getConversionFunnel,
  getTeamProductivity,
} from "@/features/dashboard/services/analytics";

export const maxDuration = 30;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;
  const auth = await requireWorkspaceMember(workspaceId);
  if (!auth.ok) return auth.response;

  const [funnel, productivity] = await Promise.all([
    getConversionFunnel(workspaceId),
    getTeamProductivity(workspaceId),
  ]);

  return NextResponse.json({ data: { funnel, productivity } });
}
