// Apply/dismiss a single prompt suggestion. Body: { action: "apply" | "dismiss" }.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireWorkspaceMember,
  readJsonBody,
} from "@/lib/auth/workspace-access";
import {
  applySuggestion,
  dismissSuggestion,
} from "@/features/agents/services/prompt-improvement";

const BodySchema = z.object({ action: z.enum(["apply", "dismiss"]) });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; suggestionId: string }> },
) {
  const { id: workspaceId, suggestionId } = await params;
  const auth = await requireWorkspaceMember(workspaceId, { minRole: "manager" });
  if (!auth.ok) return auth.response;

  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.response;
  const body = BodySchema.safeParse(parsed.body);
  if (!body.success) {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  if (body.data.action === "dismiss") {
    await dismissSuggestion(workspaceId, suggestionId);
    return NextResponse.json({ ok: true });
  }

  const result = await applySuggestion(workspaceId, suggestionId, auth.userId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
