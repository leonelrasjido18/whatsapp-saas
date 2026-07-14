// F7-B: Signed download URL for an uploaded KB file (PDF/Word/Excel source docs).

import { NextRequest, NextResponse } from "next/server";
import { createClient as createSvcClient } from "@supabase/supabase-js";
import { requireWorkspaceMember } from "@/lib/auth/workspace-access";

function svc() {
  return createSvcClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  const { id: workspaceId, docId } = await params;

  const auth = await requireWorkspaceMember(workspaceId);
  if (!auth.ok) return auth.response;

  const db = svc();
  const { data: doc } = await db
    .from("kb_documents")
    .select("meta")
    .eq("id", docId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  const meta = doc?.meta as
    | { storage_bucket?: string; storage_path?: string; original_filename?: string }
    | null;

  if (!meta?.storage_bucket || !meta?.storage_path) {
    return NextResponse.json(
      { error: "Este documento no tiene un archivo asociado" },
      { status: 404 },
    );
  }

  const { data, error } = await db.storage
    .from(meta.storage_bucket)
    .createSignedUrl(meta.storage_path, 60, {
      download: meta.original_filename ?? true,
    });

  if (error || !data) {
    console.error("[GET kb download]:", error);
    return NextResponse.json(
      { error: "No se pudo generar el enlace de descarga" },
      { status: 500 },
    );
  }

  return NextResponse.json({ data: { url: data.signedUrl } });
}
