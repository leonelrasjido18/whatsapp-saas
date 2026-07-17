// Auto-mejora del agente — GET lista sugerencias, POST regenera (analiza y llama IA).

import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceMember } from "@/lib/auth/workspace-access";
import {
  listSuggestions,
  regenerateSuggestions,
} from "@/features/agents/services/prompt-improvement";

export const maxDuration = 60;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;
  const auth = await requireWorkspaceMember(workspaceId);
  if (!auth.ok) return auth.response;

  const data = await listSuggestions(workspaceId);
  return NextResponse.json({ data });
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;
  const auth = await requireWorkspaceMember(workspaceId, { minRole: "manager" });
  if (!auth.ok) return auth.response;

  try {
    const data = await regenerateSuggestions(workspaceId);
    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al analizar" },
      { status: 400 },
    );
  }
}
