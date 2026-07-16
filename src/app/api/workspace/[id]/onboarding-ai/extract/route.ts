// #1 AI onboarding — extract. Accepts multipart form-data with an optional file
// (PDF/Word/Excel) and/or a `url` field, returns a reviewable structured proposal.

import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceMember } from "@/lib/auth/workspace-access";
import {
  extractTextFromFile,
  isUploadSizeAllowed,
} from "@/features/inbox/services/file-extractor";
import { extractOnboardingProposal } from "@/features/onboarding/services/onboarding-ai";

export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;

  const auth = await requireWorkspaceMember(workspaceId, { minRole: "manager" });
  if (!auth.ok) return auth.response;

  let url: string | null = null;
  let fileText: string | null = null;

  try {
    const form = await req.formData();
    url = (form.get("url") as string | null)?.trim() || null;

    const file = form.get("file");
    if (file && file instanceof File && file.size > 0) {
      if (!isUploadSizeAllowed(file.size)) {
        return NextResponse.json(
          { error: "El archivo supera el límite de 10 MB." },
          { status: 400 },
        );
      }
      const bytes = await file.arrayBuffer();
      const extracted = await extractTextFromFile(file.name, bytes);
      fileText = extracted.text;
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Body inválido" },
      { status: 400 },
    );
  }

  if (!url && !fileText) {
    return NextResponse.json(
      { error: "Pasá una URL o subí un archivo." },
      { status: 400 },
    );
  }

  try {
    const proposal = await extractOnboardingProposal({
      workspaceId,
      url,
      fileText,
    });
    return NextResponse.json({ data: proposal });
  } catch (err) {
    console.error("[onboarding-ai/extract]:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al analizar" },
      { status: 500 },
    );
  }
}
