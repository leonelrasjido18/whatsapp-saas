"use client";

import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Product } from "@/features/commerce/types";
import { formatArs } from "@/features/commerce/lib/money";

interface PosSaleSheetProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  onSuccess: () => void;
}

export default function PosSaleSheet({ isOpen, onClose, workspaceId, onSuccess }: PosSaleSheetProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [cart, setCart] = useState<{product: Product, qty: number}[]>([]);

  useEffect(() => {
    if (isOpen) {
      setCart([]);
      fetch(`/api/workspace/${workspaceId}/catalog/products`)
        .then(r => r.json())
        .then(d => { if(d.data) setProducts(d.data); });
    }
  }, [isOpen, workspaceId]);

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(p => p.product.id === product.id);
      if (existing) {
        return prev.map(p => p.product.id === product.id ? { ...p, qty: p.qty + 1 } : p);
      }
      return [...prev, { product, qty: 1 }];
    });
  };

  const updateQty = (id: string, delta: number) => {
    setCart(prev => prev.map(p => p.product.id === id ? { ...p, qty: Math.max(0, p.qty + delta) } : p).filter(p => p.qty > 0));
  };

  const subtotal = cart.reduce((acc, item) => acc + item.product.price * item.qty, 0);

  const handleSubmit = async () => {
    if (cart.length === 0) return;
    setLoading(true);

    const payload = {
      source: "manual",
      items: cart.map(c => ({ product_id: c.product.id, qty: c.qty })),
      note: "Venta manual POS",
    };

    try {
      const res = await fetch(`/api/workspace/${workspaceId}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const orderData = await res.json();
        // Intentar pagar automáticamente en efectivo
        await fetch(`/api/workspace/${workspaceId}/orders/${orderData.data.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "pay", payment_method: "efectivo" })
        });
        
        onSuccess();
        onClose();
      } else {
        const err = await res.json();
        alert(err.error || "Error creando venta");
      }
    } catch (e) {
      alert("Error inesperado");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto flex flex-col">
        <SheetHeader>
          <SheetTitle>Nueva Venta Rápida (POS)</SheetTitle>
        </SheetHeader>
        
        <div className="flex-1 flex flex-col mt-4 min-h-0 space-y-4">
          <div className="flex-1 overflow-y-auto border rounded p-2 bg-muted/10 space-y-2">
            <h4 className="text-sm font-semibold mb-2">Productos</h4>
            {products.filter(p => p.is_active).map(p => (
              <div key={p.id} className="flex justify-between items-center bg-card border rounded p-2 text-sm">
                <span>{p.name}</span>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-muted-foreground">{formatArs(p.price)}</span>
                  <Button size="sm" variant="secondary" onClick={() => addToCart(p)}>Añadir</Button>
                </div>
              </div>
            ))}
          </div>

          <div className="h-64 overflow-y-auto border rounded p-2 bg-muted/10">
            <h4 className="text-sm font-semibold mb-2">Carrito</h4>
            {cart.length === 0 ? (
              <p className="text-xs text-muted-foreground">Vacío</p>
            ) : (
              <div className="space-y-2">
                {cart.map(c => (
                  <div key={c.product.id} className="flex justify-between items-center text-sm border-b pb-1">
                    <span className="truncate flex-1">{c.product.name}</span>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => updateQty(c.product.id, -1)}>-</Button>
                      <span className="w-4 text-center">{c.qty}</span>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => updateQty(c.product.id, 1)}>+</Button>
                      <span className="w-20 text-right">{formatArs(c.product.price * c.qty)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="pt-4 border-t mt-4 space-y-4">
          <div className="flex justify-between font-bold text-lg">
            <span>Total:</span>
            <span>{formatArs(subtotal)}</span>
          </div>
          <Button className="w-full" size="lg" disabled={cart.length === 0 || loading} onClick={handleSubmit}>
            {loading ? "Procesando..." : "Cobrar Efectivo"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
