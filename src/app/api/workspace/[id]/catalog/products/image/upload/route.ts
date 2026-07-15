// Uploads a product image file to Storage and returns its path + a signed URL
// for immediate preview. The path is what gets saved into products.image_paths;
// the send_product_image agent tool later reads that path to send the photo.

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient as createSvcClient } from "@supabase/supabase-js";
import { requireWorkspaceMember } from "@/lib/auth/workspace-access";
import {
  PRODUCT_MEDIA_BUCKET,
  getSignedUrls,
} from "@/features/commerce/services/product-images";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

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

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "No se pudo leer el archivo" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Falta la imagen" }, { status: 400 });
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json(
      { error: "Formato no soportado. Usá JPG, PNG o WebP." },
      { status: 400 },
    );
  }
  if (file.size === 0 || file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "La imagen supera el máximo de 8 MB" },
      { status: 413 },
    );
  }

  const ext = EXT[file.type] ?? "jpg";
  const path = `${workspaceId}/products/${randomUUID()}.${ext}`;
  const db = svc();

  const bytes = await file.arrayBuffer();
  const { error: uploadError } = await db.storage
    .from(PRODUCT_MEDIA_BUCKET)
    .upload(path, Buffer.from(bytes), {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    console.error("[POST products/image/upload]:", uploadError);
    return NextResponse.json({ error: "No se pudo subir la imagen" }, { status: 500 });
  }

  const [signedUrl] = await getSignedUrls(db, [path]);
  return NextResponse.json({ data: { path, url: signedUrl } }, { status: 201 });
}
