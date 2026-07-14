// F7-B: Text extraction for uploaded KB files (PDF, Word, Excel/CSV).
// Each extractor returns plain text (or Markdown tables for spreadsheets) that
// feeds straight into kb-service's chunk-and-embed pipeline — no changes needed
// there.

import { extractText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";
import * as XLSX from "xlsx";

export type UploadableKind = "pdf" | "docx" | "xlsx";

const EXTENSION_TO_KIND: Record<string, UploadableKind> = {
  pdf: "pdf",
  doc: "docx",
  docx: "docx",
  xls: "xlsx",
  xlsx: "xlsx",
  csv: "xlsx",
};

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

export function kindFromFilename(filename: string): UploadableKind | null {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_TO_KIND[ext] ?? null;
}

export function isUploadSizeAllowed(bytes: number): boolean {
  return bytes > 0 && bytes <= MAX_UPLOAD_BYTES;
}

async function extractPdfText(buffer: Uint8Array): Promise<string> {
  const doc = await getDocumentProxy(buffer);
  const { text } = await extractText(doc, { mergePages: true });
  return text;
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  const { value } = await mammoth.extractRawText({ buffer });
  return value;
}

/**
 * Serializes every sheet as a Markdown table. Tabular chunks retrieve better in
 * semantic search than raw CSV (headers stay attached to each row's meaning).
 */
function extractSpreadsheetText(buffer: Buffer): string {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sections: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      blankrows: false,
      defval: "",
    });
    if (rows.length === 0) continue;

    const [header, ...body] = rows;
    const headerLine = `| ${header.map(String).join(" | ")} |`;
    const separatorLine = `| ${header.map(() => "---").join(" | ")} |`;
    const bodyLines = body.map(
      (row) => `| ${header.map((_, i) => String(row[i] ?? "")).join(" | ")} |`,
    );

    sections.push(
      `### ${sheetName}\n\n${headerLine}\n${separatorLine}\n${bodyLines.join("\n")}`,
    );
  }

  return sections.join("\n\n");
}

export interface ExtractedFile {
  text: string;
  kind: UploadableKind;
}

/**
 * Extracts plain text from an uploaded file's raw bytes based on its extension.
 * Throws when the file type is unsupported, the file is empty, or extraction
 * produced no usable text (e.g. a scanned PDF with no text layer).
 */
export async function extractTextFromFile(
  filename: string,
  bytes: ArrayBuffer,
): Promise<ExtractedFile> {
  const kind = kindFromFilename(filename);
  if (!kind) {
    throw new Error(
      "Tipo de archivo no soportado. Usa PDF, Word (.doc/.docx) o Excel (.xls/.xlsx/.csv).",
    );
  }

  const buffer = Buffer.from(bytes);
  let text: string;

  switch (kind) {
    case "pdf":
      text = await extractPdfText(new Uint8Array(buffer));
      break;
    case "docx":
      text = await extractDocxText(buffer);
      break;
    case "xlsx":
      text = extractSpreadsheetText(buffer);
      break;
  }

  text = text.trim();
  if (!text) {
    throw new Error(
      kind === "pdf"
        ? "No se pudo extraer texto del PDF (¿es un escaneo sin capa de texto?)."
        : "No se pudo extraer texto del archivo — está vacío o dañado.",
    );
  }

  return { text, kind };
}
