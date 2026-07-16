"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resolvePlatformAlert } from "../services/monitoring-actions";
import type { SystemAlert } from "../services/alerts";

const SEVERITY_STYLES: Record<
  string,
  { border: string; badge: string; label: string }
> = {
  critical: {
    border: "border-destructive/40 bg-destructive/5",
    badge: "bg-destructive/15 text-destructive",
    label: "Crítico",
  },
  warning: {
    border: "border-amber-500/40 bg-amber-500/5",
    badge: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    label: "Aviso",
  },
  info: {
    border: "border-border bg-muted/20",
    badge: "bg-secondary text-secondary-foreground",
    label: "Info",
  },
};

export function AlertsPanel({ initialAlerts }: { initialAlerts: SystemAlert[] }) {
  const [alerts, setAlerts] = useState<SystemAlert[]>(initialAlerts);
  const [pending, startTransition] = useTransition();
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const handleResolve = (id: string) => {
    setResolvingId(id);
    startTransition(async () => {
      const res = await resolvePlatformAlert(id);
      if (res.error) {
        toast.error(res.error);
      } else {
        setAlerts((prev) => prev.filter((a) => a.id !== id));
        toast.success("Alerta resuelta");
      }
      setResolvingId(null);
    });
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <h2 className="font-display text-lg font-semibold text-foreground">
          Monitoreo
        </h2>
        {alerts.length > 0 && (
          <span className="ml-1 rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-medium text-destructive">
            {alerts.length}
          </span>
        )}
      </div>

      {alerts.length === 0 ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          Todo funcionando. Sin alertas activas.
        </div>
      ) : (
        <ul className="space-y-2">
          {alerts.map((a) => {
            const style = SEVERITY_STYLES[a.severity] ?? SEVERITY_STYLES.info;
            return (
              <li
                key={a.id}
                className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${style.border}`}
              >
                <AlertTriangle
                  className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${style.badge}`}
                    >
                      {style.label}
                    </span>
                    <p className="font-medium text-sm text-foreground">{a.title}</p>
                  </div>
                  {a.body && (
                    <p className="text-xs text-muted-foreground mt-1">{a.body}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground/70 mt-1">
                    {new Date(a.created_at).toLocaleString("es-AR")}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending && resolvingId === a.id}
                  onClick={() => handleResolve(a.id)}
                >
                  Resolver
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
