"use client";

import { useEffect, useState, useCallback } from "react";
import { Filter, Users, Clock, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FunnelStage {
  key: string;
  label: string;
  count: number;
}
interface Analytics {
  funnel: {
    stages: FunnelStage[];
    paidOrders: number;
    conversionRate: number;
  };
  productivity: {
    agents: { userId: string; name: string; messagesSent: number; conversations: number }[];
    avgFirstResponseMin: number | null;
    handledByAi: number;
    handledByHuman: number;
  };
}

export function AnalyticsSection({ workspaceId }: { workspaceId: string }) {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/workspace/${workspaceId}/analytics`);
      const json = (await res.json()) as { data?: Analytics };
      if (json.data) setData(json.data);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load resets loading before fetch
    load();
  }, [load]);

  const maxCount = data
    ? Math.max(1, ...data.funnel.stages.map((s) => s.count))
    : 1;

  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold text-foreground">
          Analytics
        </h2>
        <a
          href={`/api/workspace/${workspaceId}/export/accounting`}
          download
        >
          <Button size="sm" variant="outline">
            <Download className="h-3.5 w-3.5 mr-1.5" aria-hidden />
            Exportar contabilidad
          </Button>
        </a>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : !data ? (
        <p className="text-sm text-muted-foreground">Sin datos.</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Funnel */}
          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Filter className="h-3.5 w-3.5 text-primary" aria-hidden />
              Embudo (últimos 30 días)
            </p>
            <div className="space-y-1.5">
              {data.funnel.stages.map((s) => (
                <div key={s.key} className="flex items-center gap-2">
                  <span className="w-24 text-xs text-muted-foreground shrink-0">
                    {s.label}
                  </span>
                  <div className="flex-1 h-5 rounded bg-muted/40 overflow-hidden">
                    <div
                      className="h-full bg-primary/70"
                      style={{ width: `${(s.count / maxCount) * 100}%` }}
                    />
                  </div>
                  <span className="w-8 text-right text-xs font-mono text-foreground">
                    {s.count}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground pt-1">
              {data.funnel.paidOrders} ventas ·{" "}
              {(data.funnel.conversionRate * 100).toFixed(1)}% de conversión
            </p>
          </div>

          {/* Team */}
          <div className="space-y-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Users className="h-3.5 w-3.5 text-primary" aria-hidden />
              Equipo (últimos 30 días)
            </p>
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-muted-foreground" aria-hidden />
              <span className="text-muted-foreground">
                Primera respuesta:
              </span>
              <span className="font-medium text-foreground">
                {data.productivity.avgFirstResponseMin != null
                  ? `${data.productivity.avgFirstResponseMin} min`
                  : "—"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {data.productivity.handledByAi} respuestas de la IA ·{" "}
              {data.productivity.handledByHuman} de humanos
            </p>
            {data.productivity.agents.length > 0 && (
              <ul className="space-y-1 text-xs">
                {data.productivity.agents.slice(0, 5).map((a) => (
                  <li key={a.userId} className="flex justify-between">
                    <span className="text-foreground">{a.name}</span>
                    <span className="text-muted-foreground font-mono">
                      {a.messagesSent} msgs · {a.conversations} chats
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
