"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { ImagePlus, Loader2, X, Sparkles } from "lucide-react";
import { Product } from "@/features/commerce/types";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ProductFormSheetProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  product: Product | null;
  onSuccess: () => void;
}

interface ProductImage {
  path: string;
  url: string; // signed URL for preview
}

export default function ProductFormSheet({ isOpen, onClose, workspaceId, product, onSuccess }: ProductFormSheetProps) {
  const [loading, setLoading] = useState(false);
  const [images, setImages] = useState<ProductImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const aiInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const isEdit = !!product;

  // Fills the (uncontrolled) form fields from an AI image analysis, without
  // clobbering anything the user already typed.
  function setFieldIfEmpty(fieldName: string, value: string) {
    const el = formRef.current?.elements.namedItem(fieldName) as
      | HTMLInputElement
      | HTMLTextAreaElement
      | null;
    if (el && !el.value) el.value = value;
  }

  async function analyzeImage(file: File) {
    setAnalyzing(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(
        `/api/workspace/${workspaceId}/catalog/products/analyze-image`,
        { method: "POST", body: fd },
      );
      const json = (await res.json()) as {
        data?: { name: string; description: string; price: number | null };
        error?: string;
      };
      if (!res.ok || !json.data) {
        throw new Error(json.error ?? "No se pudo analizar");
      }
      setFieldIfEmpty("name", json.data.name);
      setFieldIfEmpty("description", json.data.description);
      if (json.data.price != null) setFieldIfEmpty("price", String(json.data.price));
      toast.success("Datos completados con IA. Revisalos antes de guardar.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al analizar");
    } finally {
      setAnalyzing(false);
      if (aiInputRef.current) aiInputRef.current.value = "";
    }
  }

  // Load existing product images (fetch signed URLs for their stored paths).
  const loadExistingImages = useCallback(async () => {
    const paths = product?.image_paths ?? [];
    if (paths.length === 0) {
      setImages([]);
      return;
    }
    try {
      const res = await fetch(
        `/api/workspace/${workspaceId}/catalog/products/image`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paths }),
        },
      );
      const json = (await res.json()) as { data?: string[] };
      const urls = json.data ?? [];
      setImages(paths.map((path, i) => ({ path, url: urls[i] ?? "" })));
    } catch {
      setImages(paths.map((path) => ({ path, url: "" })));
    }
  }, [product, workspaceId]);

  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync images to the product being edited
      loadExistingImages();
    }
  }, [isOpen, loadExistingImages]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch(
          `/api/workspace/${workspaceId}/catalog/products/image/upload`,
          { method: "POST", body: formData },
        );
        const json = (await res.json()) as {
          data?: { path: string; url: string };
          error?: string;
        };
        if (!res.ok || !json.data) {
          throw new Error(json.error ?? "No se pudo subir la imagen");
        }
        setImages((prev) => [...prev, json.data!]);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al subir");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function removeImage(path: string) {
    setImages((prev) => prev.filter((img) => img.path !== path));
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const type = formData.get("type") as "product" | "service";

    const payload = {
      name: formData.get("name"),
      type,
      sku: formData.get("sku") || undefined,
      description: (formData.get("description") as string) || undefined,
      price: parseFloat(formData.get("price") as string),
      stock_qty: type === "product" ? parseInt(formData.get("stock_qty") as string) : null,
      image_paths: images.map((img) => img.path),
      is_active: true,
    };

    try {
      const url = `/api/workspace/${workspaceId}/catalog/products`;
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isEdit ? { id: product.id, ...payload } : payload)
      });

      if (res.ok) {
        onSuccess();
        onClose();
      } else {
        const error = await res.json();
        toast.error(error.error || "Error guardando el producto");
      }
    } catch (e) {
      console.error(e);
      toast.error("Error inesperado");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Editar" : "Nuevo"} Producto o Servicio</SheetTitle>
        </SheetHeader>

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4 mt-6">
          {/* Fotos del producto */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Fotos</label>
            <p className="text-xs text-muted-foreground">
              La IA las envía cuando un cliente pregunta por el producto.
            </p>
            <div className="flex flex-wrap gap-2">
              {images.map((img) => (
                <div
                  key={img.path}
                  className="relative h-20 w-20 rounded-md border border-border overflow-hidden bg-muted"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed Storage URL, no next/image loader */}
                  <img
                    src={img.url}
                    alt="Foto del producto"
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(img.path)}
                    aria-label="Quitar foto"
                    className="absolute top-0.5 right-0.5 rounded-full bg-background/80 p-0.5 text-foreground hover:text-destructive"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="h-20 w-20 rounded-md border-2 border-dashed border-border flex items-center justify-center text-muted-foreground hover:border-foreground/40 transition-colors disabled:opacity-50"
                aria-label="Agregar foto"
              >
                {uploading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <ImagePlus className="h-5 w-5" />
                )}
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />

            {/* Foto → producto: analiza una foto y completa los campos */}
            <button
              type="button"
              onClick={() => aiInputRef.current?.click()}
              disabled={analyzing}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline disabled:opacity-50"
            >
              {analyzing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              Completar con IA desde una foto
            </button>
            <input
              ref={aiInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) analyzeImage(f);
              }}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Tipo</label>
            <select name="type" defaultValue={product?.type || "product"} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
              <option value="product">Producto Físico</option>
              <option value="service">Servicio</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Nombre *</label>
            <Input name="name" defaultValue={product?.name || ""} required />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Descripción (opcional)</label>
            <textarea
              name="description"
              defaultValue={product?.description || ""}
              rows={2}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">SKU (opcional)</label>
            <Input name="sku" defaultValue={product?.sku || ""} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Precio (ARS) *</label>
            <Input name="price" type="number" step="0.01" min="0" defaultValue={product?.price || ""} required />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Stock Inicial</label>
            <Input name="stock_qty" type="number" step="1" min="0" defaultValue={product?.stock_qty || 0} />
            <p className="text-xs text-muted-foreground">Solo aplica para productos físicos. Para servicios se ignorará.</p>
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Guardando..." : "Guardar"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
