"use client";

import { useState } from "react";
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

export default function ProductFormSheet({ isOpen, onClose, workspaceId, product, onSuccess }: ProductFormSheetProps) {
  const [loading, setLoading] = useState(false);
  const isEdit = !!product;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    
    const formData = new FormData(e.currentTarget);
    const type = formData.get("type") as "product" | "service";
    
    const payload = {
      name: formData.get("name"),
      type,
      sku: formData.get("sku") || undefined,
      price: parseFloat(formData.get("price") as string),
      stock_qty: type === "product" ? parseInt(formData.get("stock_qty") as string) : null,
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
        alert(error.error || "Error guardando el producto");
      }
    } catch (e) {
      console.error(e);
      alert("Error inesperado");
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
        
        <form onSubmit={handleSubmit} className="space-y-4 mt-6">
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
