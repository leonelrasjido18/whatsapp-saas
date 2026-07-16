// Foto → producto (#12). Accepts an image and returns an AI-suggested product
// name/description/price to prefill the form. Manager+.

import { NextRequest, NextResponse } from "next/server";
import {
  requireWorkspaceMember,
  requireWorkspaceFeature,
} from "@/lib/auth/workspace-access";
import { suggestProductFromImage } from "@/features/inbox/services/media-understanding";

export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;

  const auth = await requireWorkspaceMember(workspaceId, { minRole: "manager" });
  if (!auth.ok) return auth.response;

  const feat = await requireWorkspaceFeature(workspaceId, "catalog_sales");
  if (!feat.ok) return feat.response;

  let bytes: Uint8Array;
  let mimeType: string | undefined;
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!file || !(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "Falta la imagen" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "La imagen supera 8 MB" }, { status: 400 });
    }
    bytes = new Uint8Array(await file.arrayBuffer());
    mimeType = file.type || undefined;
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const suggestion = await suggestProductFromImage({
    bytes,
    mimeType,
    workspaceId,
  });

  if (!suggestion) {
    return NextResponse.json(
      { error: "No se pudo analizar la imagen. Cargá los datos a mano." },
      { status: 422 },
    );
  }

  return NextResponse.json({ data: suggestion });
}
