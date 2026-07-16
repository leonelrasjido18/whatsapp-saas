"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { AlertTriangle, X } from "lucide-react";
import { resolveWorkspaceAlert } from "../services/monitoring-actions";
import type { SystemAlert } from "../services/alerts";

const SEVERITY_BORDER: Record<string, string> = {
  critical: "border-destructive/40 bg-destructive/5",
  warning: "border-amber-500/40 bg-amber-500/5",
  info: "border-border bg-muted/20",
};

/**
 * Owner-facing alert strip (low stock, handoff backlog, Meta reconnect).
 * Rendered on the dashboard. Dismissing resolves the alert.
 */
export function WorkspaceAlertsBanner({
  initialAlerts,
}: {
  initialAlerts: SystemAlert[];
}) {
  const [alerts, setAlerts] = useState<SystemAlert[]>(initialAlerts);
  const [, startTransition] = useTransition();

  if (alerts.length === 0) return null;

  const dismiss = (id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
    startTransition(async () => {
      const res = await resolveWorkspaceAlert(id);
      if (res.error) toast.error(res.error);
    });
  };

  return (
    <div className="space-y-2">
      {alerts.map((a) => (
        <div
          key={a.id}
          className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${
            SEVERITY_BORDER[a.severity] ?? SEVERITY_BORDER.info
          }`}
        >
          <AlertTriangle
            className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-sm text-foreground">{a.title}</p>
            {a.body && (
              <p className="text-xs text-muted-foreground mt-0.5">{a.body}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => dismiss(a.id)}
            aria-label="Descartar alerta"
            className="p-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
