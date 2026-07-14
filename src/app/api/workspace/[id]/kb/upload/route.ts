// F7-B: Knowledge base file upload — PDF, Word (.doc/.docx) and Excel
// (.xls/.xlsx/.csv). Extracts text server-side and feeds it into the same
// chunk-and-embed pipeline used by the text/URL ingestion route.

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient as createSvcClient } from "@supabase/supabase-js";
import {
  requireWorkspaceMember,
  requireWorkspaceFeature,
} from "@/lib/auth/workspace-access";
import { ingestDocument } from "@/features/inbox/services/kb-service";
import {
  extractTextFromFile,
  isUploadSizeAllowed,
  kindFromFilename,
} from "@/features/inbox/services/file-extractor";

export const runtime = "nodejs";
export const maxDuration = 60;

const KB_FILES_BUCKET = "whatsapp-media";
// Mirrors kb/route.ts's IngestSchema.content max — extracted text beyond this
// is truncated so a very large workbook/PDF can't blow past the chunk pipeline.
const MAX_CONTENT_CHARS = 500_000;

function svc() {
  return createSvcClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;

  const auth = await requireWorkspaceMember(workspaceId, { minRole: "manager" });
  if (!auth.ok) return auth.response;

  const feat = await requireWorkspaceFeature(workspaceId, "knowledge_base");
  if (!feat.ok) return feat.response;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "No se pudo leer el archivo enviado" },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Falta el archivo a subir" },
      { status: 400 },
    );
  }

  const kind = kindFromFilename(file.name);
  if (!kind) {
    return NextResponse.json(
      {
        error:
          "Tipo de archivo no soportado. Usa PDF, Word (.doc/.docx) o Excel (.xls/.xlsx/.csv).",
      },
      { status: 400 },
    );
  }

  if (!isUploadSizeAllowed(file.size)) {
    return NextResponse.json(
      { error: "El archivo supera el máximo permitido de 10 MB" },
      { status: 413 },
    );
  }

  const titleField = formData.get("title");
  const title =
    typeof titleField === "string" && titleField.trim()
      ? titleField.trim()
      : file.name;

  const bytes = await file.arrayBuffer();

  let extracted: Awaited<ReturnType<typeof extractTextFromFile>>;
  try {
    extracted = await extractTextFromFile(file.name, bytes);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "No se pudo leer el archivo" },
      { status: 422 },
    );
  }

  const truncated = extracted.text.length > MAX_CONTENT_CHARS;
  const content = truncated
    ? extracted.text.slice(0, MAX_CONTENT_CHARS)
    : extracted.text;

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
  const storagePath = `${workspaceId}/kb/${randomUUID()}.${ext}`;
  const db = svc();

  const { error: uploadError } = await db.storage
    .from(KB_FILES_BUCKET)
    .upload(storagePath, Buffer.from(bytes), {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (uploadError) {
    console.error("[POST /api/workspace/[id]/kb/upload] storage error:", uploadError);
    return NextResponse.json(
      { error: "No se pudo guardar el archivo" },
      { status: 500 },
    );
  }

  try {
    const result = await ingestDocument({
      workspaceId,
      title,
      content,
      sourceType: extracted.kind,
      meta: {
        storage_bucket: KB_FILES_BUCKET,
        storage_path: storagePath,
        original_filename: file.name,
      },
    });

    // Best-effort: surface chunk count in the doc list without a second round trip.
    await db
      .from("kb_documents")
      .update({
        meta: {
          storage_bucket: KB_FILES_BUCKET,
          storage_path: storagePath,
          original_filename: file.name,
          chunk_count: result.chunksCreated,
        },
      })
      .eq("id", result.documentId);

    return NextResponse.json(
      { data: { ...result, truncated } },
      { status: 201 },
    );
  } catch (err) {
    console.error("[POST /api/workspace/[id]/kb/upload]:", err);
    // Clean up the uploaded file so it doesn't linger orphaned in Storage.
    await db.storage.from(KB_FILES_BUCKET).remove([storagePath]);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }
}
