"use client";

import { useEffect, useState } from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Order } from "@/features/commerce/types";
import { formatArs } from "@/features/commerce/lib/money";
import PosSaleSheet from "./pos-sale-sheet";
import OrderDetailSheet from "./order-detail-sheet";

export default function OrdersTab({ workspaceId, role }: { workspaceId: string, role: string }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [isPosOpen, setIsPosOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  const canEdit = ["admin", "manager", "agent"].includes(role);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/workspace/${workspaceId}/orders`);
      const json = await res.json();
      if (json.data) setOrders(json.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, [workspaceId]);

  const filtered = orders.filter(o => 
    o.order_number.toString().includes(search) || 
    (o.meta?.note || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2 justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar orden #..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {canEdit && (
          <Button onClick={() => setIsPosOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nueva Venta (POS)
          </Button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-10 text-muted-foreground">Cargando órdenes...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 border rounded-lg bg-muted/20">
          <p className="text-muted-foreground">No se encontraron órdenes.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(order => (
            <div 
              key={order.id} 
              className="border rounded-lg p-4 flex flex-col gap-2 bg-card cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => setSelectedOrder(order)}
            >
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-medium">Orden #{order.order_number}</h3>
                  <p className="text-xs text-muted-foreground">
                    {new Date(order.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="text-right">
                  <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded font-medium ${
                    order.status === 'paid' ? 'bg-green-100 text-green-800' :
                    order.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                    order.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {order.status === 'paid' ? 'Pagada' : order.status === 'pending' ? 'Pendiente' : order.status === 'cancelled' ? 'Cancelada' : 'Reembolsada'}
                  </span>
                </div>
              </div>
              
              <div className="mt-auto pt-2 border-t flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Origen: {order.source}</span>
                <span className="font-semibold">{formatArs(order.total)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <PosSaleSheet 
        isOpen={isPosOpen} 
        onClose={() => setIsPosOpen(false)} 
        workspaceId={workspaceId}
        onSuccess={loadOrders}
      />

      {selectedOrder && (
        <OrderDetailSheet 
          isOpen={!!selectedOrder}
          onClose={() => setSelectedOrder(null)}
          workspaceId={workspaceId}
          orderId={selectedOrder.id}
          onUpdated={() => {
            loadOrders();
            setSelectedOrder(null);
          }}
        />
      )}
    </div>
  );
}
