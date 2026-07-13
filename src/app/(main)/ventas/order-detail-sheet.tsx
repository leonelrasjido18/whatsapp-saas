"use client";

import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Order } from "@/features/commerce/types";
import { formatArs } from "@/features/commerce/lib/money";

interface OrderDetailSheetProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  orderId: string;
  onUpdated: () => void;
}

export default function OrderDetailSheet({ isOpen, onClose, workspaceId, orderId, onUpdated }: OrderDetailSheetProps) {
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (isOpen && orderId) {
      setLoading(true);
      fetch(`/api/workspace/${workspaceId}/orders/${orderId}`)
        .then(r => r.json())
        .then(d => { if(d.data) setOrder(d.data); })
        .finally(() => setLoading(false));
    }
  }, [isOpen, orderId, workspaceId]);

  const handleAction = async (action: "pay" | "cancel" | "refund") => {
    if (!confirm(`¿Estás seguro de querer ${action === 'pay' ? 'cobrar' : action === 'cancel' ? 'cancelar' : 'reembolsar'} esta orden?`)) return;
    
    setActionLoading(true);
    try {
      const body: any = { action };
      if (action === "pay") {
        body.payment_method = "efectivo"; // Simplificado para POS, en el futuro dejar elegir
      }
      const res = await fetch(`/api/workspace/${workspaceId}/orders/${orderId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        onUpdated();
      } else {
        const err = await res.json();
        alert(err.error || `Error al ${action} la orden`);
      }
    } catch (e) {
      alert("Error inesperado");
    } finally {
      setActionLoading(false);
    }
  };

  const handleInvoice = async () => {
    if (!confirm(`¿Estás seguro de emitir Factura C electrónica para esta orden?`)) return;
    
    const docInput = window.prompt("Opcional: Ingrese DNI (8 dígitos) o CUIT (11 dígitos) del cliente.\nDeje en blanco para Consumidor Final (Anónimo).");
    if (docInput === null) return; // Cancelado
    
    let docType = 99;
    let docNumber = "0";
    const cleaned = docInput.replace(/\D/g, "");
    
    if (cleaned.length === 8) {
      docType = 96; // DNI
      docNumber = cleaned;
    } else if (cleaned.length === 11) {
      docType = 80; // CUIT
      docNumber = cleaned;
    } else if (cleaned.length > 0) {
      alert("El documento ingresado no es válido. Debe tener 8 (DNI) u 11 (CUIT) dígitos.");
      return;
    }
    
    setActionLoading(true);
    try {
      const res = await fetch(`/api/workspace/${workspaceId}/orders/${orderId}/invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docType, docNumber })
      });
      if (res.ok) {
        alert("Factura generada con éxito");
        onUpdated();
      } else {
        const err = await res.json();
        alert(err.error || `Error al facturar la orden`);
      }
    } catch (e) {
      alert("Error inesperado");
    } finally {
      setActionLoading(false);
    }
  };

  const handlePaymentLink = async () => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/workspace/${workspaceId}/orders/${orderId}/payment-link`, {
        method: "POST"
      });
      if (res.ok) {
        const { url } = await res.json();
        await navigator.clipboard.writeText(url);
        alert("Link de pago copiado al portapapeles: " + url);
        onUpdated();
      } else {
        const err = await res.json();
        alert(err.error || `Error al generar link de pago`);
      }
    } catch (e) {
      alert("Error inesperado");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Orden #{order?.order_number}</SheetTitle>
        </SheetHeader>
        
        {loading || !order ? (
          <div className="py-10 text-center text-muted-foreground">Cargando...</div>
        ) : (
          <div className="space-y-6 mt-6">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Estado</span>
              <span className="font-semibold uppercase">{order.status}</span>
            </div>
            
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Fecha</span>
              <span>{new Date(order.created_at).toLocaleString()}</span>
            </div>

            <div className="border rounded p-4 space-y-2">
              <h4 className="font-semibold text-sm mb-2">Artículos</h4>
              {order.items?.map(item => (
                <div key={item.id} className="flex justify-between text-sm">
                  <span>{item.qty}x {item.product_name}</span>
                  <span>{formatArs(item.line_total)}</span>
                </div>
              ))}
              <div className="border-t pt-2 mt-2 flex justify-between font-bold text-lg">
                <span>Total</span>
                <span>{formatArs(order.total)}</span>
              </div>
            </div>

            {order.invoice_id && (
              <div className="border rounded p-4 space-y-2 bg-muted/20">
                <h4 className="font-semibold text-sm mb-2">Facturación AFIP</h4>
                <div className="text-sm">Comprobante: {order.invoice_id}</div>
                <div className="text-sm">CAE: {order.invoice_cae}</div>
              </div>
            )}

            <div className="flex flex-col gap-2 pt-4">
              {order.status === "pending" && (
                <>
                  <Button variant="outline" onClick={handlePaymentLink} disabled={actionLoading}>
                    Generar Link de Pago (Copiar)
                  </Button>
                  <Button onClick={() => handleAction("pay")} disabled={actionLoading}>
                    Marcar como Pagada (Efectivo)
                  </Button>
                  <Button variant="destructive" onClick={() => handleAction("cancel")} disabled={actionLoading}>
                    Cancelar Orden
                  </Button>
                </>
              )}
              {order.status === "paid" && (
                <>
                  {!order.invoice_id && (
                    <Button variant="outline" onClick={handleInvoice} disabled={actionLoading}>
                      Emitir Factura C (AFIP)
                    </Button>
                  )}
                  <Button variant="destructive" onClick={() => handleAction("refund")} disabled={actionLoading}>
                    Reembolsar Orden
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
