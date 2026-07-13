"use client";

import { useState } from "react";
import { Product } from "@/features/commerce/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface StockAdjustDialogProps {
  workspaceId: string;
  product: Product | null;
  onClose: () => void;
  onSuccess: () => void;
}

export default function StockAdjustDialog({ workspaceId, product, onClose, onSuccess }: StockAdjustDialogProps) {
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!product) return;
    
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    
    const payload = {
      product_id: product.id,
      delta: parseInt(formData.get("delta") as string),
      type: "ajuste",
      note: formData.get("note") as string,
    };

    try {
      const url = `/api/workspace/${workspaceId}/catalog/stock`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      
      if (res.ok) {
        onSuccess();
        onClose();
      } else {
        const error = await res.json();
        alert(error.error || "Error ajustando el stock");
      }
    } catch (e) {
      console.error(e);
      alert("Error inesperado");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={!!product} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajustar Stock</DialogTitle>
          <DialogDescription>
            Producto: <strong>{product?.name}</strong> (Stock actual: {product?.stock_qty})
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Ajuste (+ para sumar, - para restar)</label>
            <Input name="delta" type="number" step="1" required placeholder="Ej: -5 o 10" />
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium">Nota (opcional)</label>
            <Input name="note" placeholder="Razón del ajuste (ej. merma, inventario)" />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Guardando..." : "Confirmar Ajuste"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
