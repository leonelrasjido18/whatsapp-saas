"use client";

import { useEffect, useState } from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Product } from "@/features/commerce/types";
import { formatArs } from "@/features/commerce/lib/money";
import ProductFormSheet from "./product-form-sheet";
import StockAdjustDialog from "./stock-adjust-dialog";

export default function CatalogTab({ workspaceId, role }: { workspaceId: string, role: string }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [stockAdjustProduct, setStockAdjustProduct] = useState<Product | null>(null);

  const canEdit = ["admin", "manager"].includes(role);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/workspace/${workspaceId}/catalog/products`);
      const json = await res.json();
      if (json.data) setProducts(json.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, [workspaceId]);

  const filtered = products.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) || 
    p.sku?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2 justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar productos..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {canEdit && (
          <Button onClick={() => { setSelectedProduct(null); setIsFormOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo Producto
          </Button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-10 text-muted-foreground">Cargando catálogo...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 border rounded-lg bg-muted/20">
          <p className="text-muted-foreground">No se encontraron productos.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(product => (
            <div key={product.id} className="border rounded-lg p-4 flex flex-col gap-2 bg-card">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-medium">{product.name}</h3>
                  {product.sku && <p className="text-xs text-muted-foreground">SKU: {product.sku}</p>}
                </div>
                <div className="text-right">
                  <p className="font-semibold">{formatArs(product.price)}</p>
                  <span className="text-[10px] uppercase bg-secondary px-1.5 py-0.5 rounded text-secondary-foreground">
                    {product.type === 'service' ? 'Servicio' : 'Producto'}
                  </span>
                </div>
              </div>
              
              {product.type === 'product' && (
                <div className="flex items-center justify-between mt-auto pt-2 border-t">
                  <span className={`text-sm ${product.stock_qty !== null && product.stock_qty <= product.low_stock_threshold ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                    Stock: {product.stock_qty ?? 0}
                  </span>
                  {canEdit && (
                    <Button variant="outline" size="sm" onClick={() => setStockAdjustProduct(product)}>
                      Ajustar Stock
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ProductFormSheet 
        isOpen={isFormOpen} 
        onClose={() => setIsFormOpen(false)} 
        workspaceId={workspaceId}
        product={selectedProduct}
        onSuccess={loadProducts}
      />

      <StockAdjustDialog 
        product={stockAdjustProduct}
        onClose={() => setStockAdjustProduct(null)}
        workspaceId={workspaceId}
        onSuccess={loadProducts}
      />
    </div>
  );
}
