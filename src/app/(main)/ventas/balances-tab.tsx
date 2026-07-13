"use client";

import { useEffect, useState } from "react";
import { formatArs } from "@/features/commerce/lib/money";
import { AlertTriangle, TrendingUp, Package } from "lucide-react";

interface ProductMetric {
  name: string;
  qty: number;
  revenue: number;
}

interface Balances {
  today: number;
  week: number;
  month: number;
  total: number;
  avg_ticket: number;
  by_method: Record<string, number>;
  by_source: Record<string, number>;
  by_channel: Record<string, number>;
  top_products: ProductMetric[];
  low_stock_count: number;
}

export default function BalancesTab({ workspaceId }: { workspaceId: string }) {
  const [balances, setBalances] = useState<Balances | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/workspace/${workspaceId}/balances`);
        const json = await res.json();
        if (json.data) setBalances(json.data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [workspaceId]);

  if (loading) {
    return <div className="text-center py-10 text-muted-foreground">Cargando balances...</div>;
  }

  if (!balances) {
    return <div className="text-center py-10 text-muted-foreground">Error al cargar balances</div>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Balances de Ventas</h2>
        <p className="text-muted-foreground">Las métricas reflejan únicamente las órdenes marcadas como <b>Pagadas</b>.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <BalanceCard title="Hoy" amount={balances.today} />
        <BalanceCard title="Esta Semana" amount={balances.week} />
        <BalanceCard title="Este Mes" amount={balances.month} />
        <BalanceCard title="Total Histórico" amount={balances.total} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="border rounded-xl p-6 bg-card space-y-4 shadow-sm">
          <div className="flex items-center gap-2 text-primary">
            <TrendingUp className="h-5 w-5" />
            <h3 className="font-semibold">Ticket Promedio</h3>
          </div>
          <div className="text-3xl font-bold">{formatArs(balances.avg_ticket)}</div>
        </div>
        
        <div className="border rounded-xl p-6 bg-card space-y-4 shadow-sm md:col-span-2 flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-orange-500">
              <AlertTriangle className="h-5 w-5" />
              <h3 className="font-semibold">Alerta de Stock</h3>
            </div>
            <p className="text-sm text-muted-foreground">Productos con 5 unidades o menos</p>
          </div>
          <div className="text-4xl font-black text-orange-500">
            {balances.low_stock_count}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="border rounded-xl p-6 bg-card space-y-4 shadow-sm">
          <h3 className="font-semibold border-b pb-2">Por Método de Pago</h3>
          <ul className="space-y-3">
            {Object.entries(balances.by_method).map(([method, amount]) => (
              <li key={method} className="flex justify-between items-center text-sm">
                <span className="capitalize text-muted-foreground">{method}</span>
                <span className="font-medium">{formatArs(amount)}</span>
              </li>
            ))}
            {Object.keys(balances.by_method).length === 0 && (
              <li className="text-muted-foreground text-sm">Sin datos este mes</li>
            )}
          </ul>
        </div>

        <div className="border rounded-xl p-6 bg-card space-y-4 shadow-sm">
          <h3 className="font-semibold border-b pb-2">Por Origen</h3>
          <ul className="space-y-3">
            {Object.entries(balances.by_source).map(([source, amount]) => (
              <li key={source} className="flex justify-between items-center text-sm">
                <span className="capitalize text-muted-foreground">{source === "chat" ? "Bot / IA" : "Manual (POS)"}</span>
                <span className="font-medium">{formatArs(amount)}</span>
              </li>
            ))}
            {Object.keys(balances.by_source).length === 0 && (
              <li className="text-muted-foreground text-sm">Sin datos este mes</li>
            )}
          </ul>
        </div>

        <div className="border rounded-xl p-6 bg-card space-y-4 shadow-sm">
          <h3 className="font-semibold border-b pb-2">Por Canal</h3>
          <ul className="space-y-3">
            {Object.entries(balances.by_channel).map(([channel, amount]) => (
              <li key={channel} className="flex justify-between items-center text-sm">
                <span className="capitalize text-muted-foreground">{channel}</span>
                <span className="font-medium">{formatArs(amount)}</span>
              </li>
            ))}
            {Object.keys(balances.by_channel).length === 0 && (
              <li className="text-muted-foreground text-sm">Sin datos este mes</li>
            )}
          </ul>
        </div>
      </div>

      <div className="border rounded-xl p-6 bg-card space-y-4 shadow-sm">
        <div className="flex items-center gap-2 border-b pb-2">
          <Package className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold">Top 5 Productos (Mes)</h3>
        </div>
        
        {balances.top_products.length > 0 ? (
          <div className="divide-y">
            {balances.top_products.map((p, i) => (
              <div key={i} className="py-3 flex items-center justify-between">
                <div>
                  <div className="font-medium">{p.name}</div>
                  <div className="text-sm text-muted-foreground">{p.qty} unidades vendidas</div>
                </div>
                <div className="font-bold">{formatArs(p.revenue)}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-muted-foreground text-sm py-4">No hay ventas registradas este mes.</div>
        )}
      </div>
    </div>
  );
}

function BalanceCard({ title, amount }: { title: string, amount: number }) {
  return (
    <div className="border rounded-xl p-6 bg-card flex flex-col gap-2 shadow-sm transition-all hover:shadow-md">
      <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      <div className="text-3xl font-bold">{formatArs(amount)}</div>
    </div>
  );
}
