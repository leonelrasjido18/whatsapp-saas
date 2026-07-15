"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Search, FileSpreadsheet, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Product } from "@/features/commerce/types";
import { formatArs } from "@/features/commerce/lib/money";
import ProductFormSheet from "./product-form-sheet";
import StockAdjustDialog from "./stock-adjust-dialog";
import CatalogImportDialog from "./catalog-import-dialog";

export default function CatalogTab({ workspaceId, role }: { workspaceId: string, role: string }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [stockAdjustProduct, setStockAdjustProduct] = useState<Product | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const canEdit = ["admin", "manager"].includes(role);

  const handleEdit = (product: Product) => {
    setSelectedProduct(product);
    setIsFormOpen(true);
  };

  const handleDelete = async (product: Product) => {
    if (!confirm(`¿Eliminar "${product.name}" del catálogo? Esta acción no se puede deshacer.`)) {
      return;
    }
    setDeletingId(product.id);
    try {
      const res = await fetch(
        `/api/workspace/${workspaceId}/catalog/products?productId=${product.id}`,
        { method: "DELETE" },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al eliminar");
      toast.success("Producto eliminado");
      setProducts((prev) => prev.filter((p) => p.id !== product.id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al eliminar");
    } finally {
      setDeletingId(null);
    }
  };

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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loadProducts resets loading before fetch
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
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setIsImportOpen(true)}>
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Importar Excel
            </Button>
            <Button onClick={() => { setSelectedProduct(null); setIsFormOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" />
              Nuevo Producto
            </Button>
          </div>
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
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                  <h3 className="font-medium truncate">{product.name}</h3>
                  {product.sku && <p className="text-xs text-muted-foreground">SKU: {product.sku}</p>}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {canEdit && (
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => handleEdit(product)}
                        aria-label={`Editar ${product.name}`}
                        className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(product)}
                        disabled={deletingId === product.id}
                        aria-label={`Eliminar ${product.name}`}
                        className="p-1.5 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
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

      <CatalogImportDialog
        workspaceId={workspaceId}
        open={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onSuccess={loadProducts}
      />
    </div>
  );
}
