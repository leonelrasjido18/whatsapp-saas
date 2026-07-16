// Business insights (#) — GET latest, POST to regenerate. Manager+ to regenerate
// (it spends an LLM call); any member can read.

import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceMember } from "@/lib/auth/workspace-access";
import {
  getStoredInsights,
  regenerateInsights,
} from "@/features/dashboard/services/insights";

export const maxDuration = 60;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;
  const auth = await requireWorkspaceMember(workspaceId);
  if (!auth.ok) return auth.response;

  const stored = await getStoredInsights(workspaceId);
  return NextResponse.json({ data: stored });
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;
  const auth = await requireWorkspaceMember(workspaceId, { minRole: "manager" });
  if (!auth.ok) return auth.response;

  try {
    const stored = await regenerateInsights(workspaceId);
    return NextResponse.json({ data: stored });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al generar insights" },
      { status: 400 },
    );
  }
}
