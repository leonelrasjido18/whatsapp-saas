// Bulk catalog import from an uploaded Excel/CSV workbook.
// Two-phase flow: parse+validate (dry run, no writes) → commit (upsert by SKU).
// Mirrors the createProduct() shape in catalog.ts but adds SKU-based upsert,
// which that function intentionally doesn't do (it's a plain insert used by
// the manual product form).

import type { SupabaseClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import { z } from "zod";

// ── Header normalization ─────────────────────────────────────────────────────
// Tolerates the header spellings a shop owner is likely to type, not just the
// exact template columns.

type CatalogColumn =
  | "sku"
  | "nombre"
  | "descripcion"
  | "precio"
  | "stock"
  | "categoria";

const HEADER_ALIASES: Record<string, CatalogColumn> = {
  sku: "sku",
  codigo: "sku",
  código: "sku",
  nombre: "nombre",
  producto: "nombre",
  name: "nombre",
  descripcion: "descripcion",
  descripción: "descripcion",
  detalle: "descripcion",
  precio: "precio",
  price: "precio",
  stock: "stock",
  cantidad: "stock",
  existencias: "stock",
  categoria: "categoria",
  categoría: "categoria",
  rubro: "categoria",
};

function normalizeHeader(raw: string): CatalogColumn | null {
  const key = raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, ""); // strip accents (á → a, etc.)
  return HEADER_ALIASES[key] ?? null;
}

/** Handles AR-style "1.234,50" as well as plain "1234.50" / numeric cells. */
function coerceNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/[^\d.,-]/g, "");
  if (!trimmed) return null;

  let normalized = trimmed;
  if (trimmed.includes(",") && trimmed.includes(".")) {
    // Whichever separator appears last is the decimal point.
    normalized =
      trimmed.lastIndexOf(",") > trimmed.lastIndexOf(".")
        ? trimmed.replace(/\./g, "").replace(",", ".")
        : trimmed.replace(/,/g, "");
  } else if (trimmed.includes(",")) {
    normalized = trimmed.replace(",", ".");
  }

  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

// ── Parsing ───────────────────────────────────────────────────────────────────

export interface RawCatalogRow {
  rowNumber: number; // 1-indexed, matching the spreadsheet row (header = row 1)
  sku?: string;
  nombre?: string;
  descripcion?: string;
  precio?: number | null;
  stock?: number | null;
  categoria?: string;
}

/** Reads the first sheet of the workbook and maps recognized headers only. */
export function parseCatalogWorkbook(buffer: Buffer): RawCatalogRow[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];

  const sheet = workbook.Sheets[sheetName];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    blankrows: false,
    defval: "",
  });
  if (rows.length < 2) return [];

  const [headerRow, ...dataRows] = rows;
  const columns = headerRow.map((h) => normalizeHeader(String(h ?? "")));

  return dataRows.map((row, idx) => {
    const parsed: Record<string, string | number | null> = {};
    columns.forEach((col, colIdx) => {
      if (!col) return;
      const cell = row[colIdx];
      if (col === "precio" || col === "stock") {
        parsed[col] = coerceNumber(cell);
      } else {
        const text = String(cell ?? "").trim();
        if (text) parsed[col] = text;
      }
    });
    return { rowNumber: idx + 2, ...parsed } as RawCatalogRow;
  });
}

// ── Validation ────────────────────────────────────────────────────────────────

const RowSchema = z.object({
  sku: z.string().trim().max(200).optional(),
  nombre: z.string({ error: "Falta el nombre" }).trim().min(1, "Falta el nombre"),
  descripcion: z.string().trim().max(2000).optional(),
  precio: z
    .number({ error: "Precio inválido o faltante" })
    .nonnegative("El precio no puede ser negativo"),
  stock: z.number().int().nonnegative().nullable().optional(),
  categoria: z.string().trim().max(200).optional(),
});

export interface ValidCatalogRow {
  rowNumber: number;
  sku?: string;
  nombre: string;
  descripcion?: string;
  precio: number;
  stock: number | null;
  categoria?: string;
}

export interface CatalogRowError {
  rowNumber: number;
  message: string;
}

export interface CatalogValidationResult {
  valid: ValidCatalogRow[];
  errors: CatalogRowError[];
  totalRows: number;
}

export function validateCatalogRows(
  rawRows: RawCatalogRow[],
): CatalogValidationResult {
  const valid: ValidCatalogRow[] = [];
  const errors: CatalogRowError[] = [];

  for (const raw of rawRows) {
    // Skip fully blank rows (trailing empty lines in the sheet).
    if (!raw.nombre && !raw.sku && raw.precio == null) continue;

    const result = RowSchema.safeParse({
      sku: raw.sku,
      nombre: raw.nombre,
      descripcion: raw.descripcion,
      precio: raw.precio ?? undefined,
      stock: raw.stock ?? null,
      categoria: raw.categoria,
    });

    if (!result.success) {
      errors.push({
        rowNumber: raw.rowNumber,
        message: result.error.issues[0]?.message ?? "Fila inválida",
      });
      continue;
    }

    valid.push({
      rowNumber: raw.rowNumber,
      ...result.data,
      stock: result.data.stock ?? null,
    });
  }

  return { valid, errors, totalRows: rawRows.length };
}

// ── Commit (upsert) ──────────────────────────────────────────────────────────

export interface CatalogImportSummary {
  created: number;
  updated: number;
  categoriesCreated: number;
}

/**
 * Upserts valid rows into `products`. Rows with a SKU that already exists in
 * the workspace are updated in place; everything else (no SKU, or a SKU not
 * seen before) is inserted as a new product. Category names are resolved
 * against `product_categories`, creating missing ones on the fly.
 */
export async function importCatalogRows(
  supabase: SupabaseClient,
  workspaceId: string,
  rows: ValidCatalogRow[],
): Promise<CatalogImportSummary> {
  const summary: CatalogImportSummary = {
    created: 0,
    updated: 0,
    categoriesCreated: 0,
  };
  if (rows.length === 0) return summary;

  // 1. Resolve category names → ids, creating missing categories once each.
  const categoryNames = [
    ...new Set(rows.map((r) => r.categoria).filter((c): c is string => !!c)),
  ];
  const categoryIdByName = new Map<string, string>();

  if (categoryNames.length > 0) {
    const { data: existing } = await supabase
      .from("product_categories")
      .select("id, name")
      .eq("workspace_id", workspaceId)
      .in("name", categoryNames);

    for (const cat of existing ?? []) {
      categoryIdByName.set(cat.name as string, cat.id as string);
    }

    const missing = categoryNames.filter((n) => !categoryIdByName.has(n));
    if (missing.length > 0) {
      const { data: created, error } = await supabase
        .from("product_categories")
        .insert(missing.map((name) => ({ workspace_id: workspaceId, name })))
        .select("id, name");
      if (error) throw error;
      for (const cat of created ?? []) {
        categoryIdByName.set(cat.name as string, cat.id as string);
      }
      summary.categoriesCreated = created?.length ?? 0;
    }
  }

  // 2. Resolve existing products by SKU (only rows that have one).
  const skus = rows.map((r) => r.sku).filter((s): s is string => !!s);
  const existingIdBySku = new Map<string, string>();
  if (skus.length > 0) {
    const { data: existingProducts } = await supabase
      .from("products")
      .select("id, sku")
      .eq("workspace_id", workspaceId)
      .in("sku", skus);
    for (const p of existingProducts ?? []) {
      if (p.sku) existingIdBySku.set(p.sku as string, p.id as string);
    }
  }

  // 3. Split into inserts and updates, run each batch.
  const toInsert: Record<string, unknown>[] = [];
  const toUpdate: { id: string; patch: Record<string, unknown> }[] = [];

  for (const row of rows) {
    const stock_qty = row.stock ?? 0;
    const base = {
      type: "product" as const,
      name: row.nombre,
      description: row.descripcion ?? null,
      sku: row.sku ?? null,
      price: row.precio,
      stock_qty,
      category_id: row.categoria ? categoryIdByName.get(row.categoria) ?? null : null,
    };

    const existingId = row.sku ? existingIdBySku.get(row.sku) : undefined;
    if (existingId) {
      toUpdate.push({ id: existingId, patch: base });
    } else {
      toInsert.push({ workspace_id: workspaceId, ...base });
    }
  }

  if (toInsert.length > 0) {
    const { error } = await supabase.from("products").insert(toInsert);
    if (error) throw error;
    summary.created = toInsert.length;
  }

  for (const { id, patch } of toUpdate) {
    const { error } = await supabase
      .from("products")
      .update(patch)
      .eq("id", id)
      .eq("workspace_id", workspaceId);
    if (error) throw error;
  }
  summary.updated = toUpdate.length;

  return summary;
}

// ── Downloadable template ────────────────────────────────────────────────────

export function buildCatalogTemplateWorkbook(): Buffer {
  const headers = ["sku", "nombre", "descripcion", "precio", "stock", "categoria"];
  const sample = [
    ["REM-001", "Remera básica algodón", "Remera de algodón peinado, cuello redondo", 8500, 20, "Remeras"],
    ["PANT-014", "Pantalón cargo", "", 15900, 8, "Pantalones"],
  ];
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...sample]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Catálogo");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
