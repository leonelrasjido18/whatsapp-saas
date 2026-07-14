"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Loader2, UploadCloud, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatArs } from "@/features/commerce/lib/money";

interface PreviewRow {
  rowNumber: number;
  sku?: string;
  nombre: string;
  precio: number;
  stock: number | null;
  categoria?: string;
}

interface RowError {
  rowNumber: number;
  message: string;
}

interface PreviewData {
  totalRows: number;
  validCount: number;
  errors: RowError[];
  preview: PreviewRow[];
}

interface Props {
  workspaceId: string;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CatalogImportDialog({
  workspaceId,
  open,
  onClose,
  onSuccess,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);

  function reset() {
    setFile(null);
    setPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleFileChange(selected: File | null) {
    setFile(selected);
    setPreview(null);
    if (!selected) return;

    setIsParsing(true);
    try {
      const formData = new FormData();
      formData.append("file", selected);
      const res = await fetch(
        `/api/workspace/${workspaceId}/catalog/import`,
        { method: "POST", body: formData },
      );
      const json = (await res.json()) as { data?: PreviewData; error?: string };
      if (!res.ok || !json.data) {
        throw new Error(json.error ?? "No se pudo leer el archivo");
      }
      setPreview(json.data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al leer el archivo");
      reset();
    } finally {
      setIsParsing(false);
    }
  }

  async function handleCommit() {
    if (!file) return;
    setIsCommitting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(
        `/api/workspace/${workspaceId}/catalog/import?commit=true`,
        { method: "POST", body: formData },
      );
      const json = (await res.json()) as {
        data?: { created: number; updated: number; categoriesCreated: number };
        error?: string;
      };
      if (!res.ok || !json.data) {
        throw new Error(json.error ?? "Error al importar el catálogo");
      }
      toast.success(
        `Catálogo importado — ${json.data.created} creados, ${json.data.updated} actualizados` +
          (json.data.categoriesCreated
            ? `, ${json.data.categoriesCreated} categorías nuevas`
            : ""),
      );
      onSuccess();
      handleClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al importar");
    } finally {
      setIsCommitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar catálogo desde Excel</DialogTitle>
          <DialogDescription>
            Subí un archivo .xlsx, .xls o .csv con columnas sku, nombre,
            descripcion, precio, stock y categoria.
          </DialogDescription>
        </DialogHeader>

        <a
          href={`/api/workspace/${workspaceId}/catalog/import`}
          className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline w-fit"
        >
          <Download className="h-3.5 w-3.5" aria-hidden />
          Descargar plantilla de ejemplo
        </a>

        {!file ? (
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
            }}
            className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border/60 p-8 text-center cursor-pointer hover:border-border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
            />
            <UploadCloud className="h-8 w-8 text-muted-foreground/60" aria-hidden />
            <p className="text-sm text-muted-foreground">
              Arrastrá tu archivo acá o hacé clic para elegirlo
            </p>
          </div>
        ) : isParsing ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Leyendo archivo…
          </div>
        ) : preview ? (
          <div className="space-y-3">
            <div className="flex items-center gap-4 text-sm">
              <span className="text-foreground font-medium">
                {preview.validCount} de {preview.totalRows} filas listas para
                importar
              </span>
              {preview.errors.length > 0 && (
                <span className="inline-flex items-center gap-1 text-amber-500">
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                  {preview.errors.length} con errores
                </span>
              )}
            </div>

            {preview.preview.length > 0 && (
              <div className="max-h-64 overflow-auto rounded-md border border-border/60">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 sticky top-0">
                    <tr>
                      <th className="text-left p-2 font-medium">Nombre</th>
                      <th className="text-left p-2 font-medium">SKU</th>
                      <th className="text-right p-2 font-medium">Precio</th>
                      <th className="text-right p-2 font-medium">Stock</th>
                      <th className="text-left p-2 font-medium">Categoría</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.preview.map((row) => (
                      <tr key={row.rowNumber} className="border-t border-border/40">
                        <td className="p-2">{row.nombre}</td>
                        <td className="p-2 text-muted-foreground">{row.sku ?? "—"}</td>
                        <td className="p-2 text-right">{formatArs(row.precio)}</td>
                        <td className="p-2 text-right">{row.stock ?? "—"}</td>
                        <td className="p-2 text-muted-foreground">
                          {row.categoria ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.validCount > preview.preview.length && (
                  <p className="p-2 text-xs text-muted-foreground border-t border-border/40">
                    …y {preview.validCount - preview.preview.length} filas más
                  </p>
                )}
              </div>
            )}

            {preview.errors.length > 0 && (
              <div className="max-h-32 overflow-auto rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-amber-600 dark:text-amber-400 space-y-0.5">
                {preview.errors.slice(0, 10).map((e, i) => (
                  <p key={i}>
                    Fila {e.rowNumber}: {e.message}
                  </p>
                ))}
                {preview.errors.length > 10 && (
                  <p>…y {preview.errors.length - 10} errores más</p>
                )}
              </div>
            )}
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose} disabled={isCommitting}>
            Cancelar
          </Button>
          {file && preview && (
            <Button
              type="button"
              onClick={handleCommit}
              disabled={isCommitting || preview.validCount === 0}
              aria-busy={isCommitting}
            >
              {isCommitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden />
                  Importando…
                </>
              ) : (
                `Importar ${preview.validCount} productos`
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
