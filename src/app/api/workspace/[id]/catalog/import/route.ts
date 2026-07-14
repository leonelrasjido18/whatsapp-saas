// Bulk catalog import from Excel/CSV.
// GET  → downloads the fillable template.
// POST → parses + validates the uploaded workbook; commits the upsert only
//        when ?commit=true (the client first shows the user a preview).

import { NextRequest, NextResponse } from "next/server";
import { createClient as createSvcClient } from "@supabase/supabase-js";
import {
  requireWorkspaceMember,
  requireWorkspaceFeature,
} from "@/lib/auth/workspace-access";
import {
  parseCatalogWorkbook,
  validateCatalogRows,
  importCatalogRows,
  buildCatalogTemplateWorkbook,
} from "@/features/commerce/services/catalog-import";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ["xlsx", "xls", "csv"];

function svc() {
  return createSvcClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;

  const auth = await requireWorkspaceMember(workspaceId);
  if (!auth.ok) return auth.response;

  const buffer = buildCatalogTemplateWorkbook();
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="plantilla-catalogo.xlsx"',
    },
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;

  const auth = await requireWorkspaceMember(workspaceId, { minRole: "manager" });
  if (!auth.ok) return auth.response;

  const feat = await requireWorkspaceFeature(workspaceId, "catalog_sales");
  if (!feat.ok) return feat.response;

  const commit = req.nextUrl.searchParams.get("commit") === "true";

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

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return NextResponse.json(
      { error: "Usa un archivo Excel (.xlsx/.xls) o CSV" },
      { status: 400 },
    );
  }

  if (file.size === 0 || file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: "El archivo supera el máximo permitido de 10 MB" },
      { status: 413 },
    );
  }

  let validation: ReturnType<typeof validateCatalogRows>;
  try {
    const bytes = await file.arrayBuffer();
    const rawRows = parseCatalogWorkbook(Buffer.from(bytes));
    if (rawRows.length === 0) {
      return NextResponse.json(
        {
          error:
            "No se encontraron filas de datos. Verificá que la primera fila tenga los encabezados (nombre, precio, etc.)",
        },
        { status: 422 },
      );
    }
    validation = validateCatalogRows(rawRows);
  } catch (err) {
    console.error("[POST catalog/import] parse error:", err);
    return NextResponse.json(
      { error: "No se pudo leer el archivo — ¿está dañado?" },
      { status: 422 },
    );
  }

  if (!commit) {
    // Dry run: return the preview so the UI can show it before writing anything.
    return NextResponse.json({
      data: {
        totalRows: validation.totalRows,
        validCount: validation.valid.length,
        errors: validation.errors,
        preview: validation.valid.slice(0, 20),
      },
    });
  }

  if (validation.valid.length === 0) {
    return NextResponse.json(
      { error: "No hay filas válidas para importar" },
      { status: 422 },
    );
  }

  try {
    const summary = await importCatalogRows(svc(), workspaceId, validation.valid);
    return NextResponse.json({
      data: { ...summary, errors: validation.errors },
    });
  } catch (err) {
    console.error("[POST catalog/import] commit error:", err);
    return NextResponse.json(
      { error: "Error al importar el catálogo" },
      { status: 500 },
    );
  }
}
