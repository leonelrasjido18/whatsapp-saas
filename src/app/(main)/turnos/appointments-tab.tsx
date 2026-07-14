"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Calendar, Check, X, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Appointment {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  customer_name: string | null;
  note: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  confirmed: "Confirmado",
  cancelled: "Cancelado",
  no_show: "No vino",
  done: "Realizado",
};

export default function AppointmentsTab({
  workspaceId,
  canManage,
}: {
  workspaceId: string;
  canManage: boolean;
}) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/workspace/${workspaceId}/booking/appointments`,
      );
      const json = (await res.json()) as { data?: Appointment[] };
      setAppointments(json.data ?? []);
    } catch {
      toast.error("No se pudieron cargar los turnos");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load resets loading before fetch
    load();
  }, [load]);

  async function setStatus(id: string, status: string) {
    try {
      const res = await fetch(
        `/api/workspace/${workspaceId}/booking/appointments/${id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        },
      );
      if (!res.ok) throw new Error();
      toast.success("Turno actualizado");
      load();
    } catch {
      toast.error("No se pudo actualizar");
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Cargando…</p>;
  }

  const active = appointments.filter(
    (a) => a.status === "confirmed" || a.status === "pending",
  );

  if (active.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border/60 py-16 text-center">
        <Calendar className="h-9 w-9 text-muted-foreground/50" aria-hidden />
        <p className="text-sm text-muted-foreground">
          No hay turnos próximos. La IA agenda automáticamente cuando un cliente
          reserva por WhatsApp.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {active.map((a) => {
        const start = new Date(a.starts_at);
        return (
          <div
            key={a.id}
            className="flex items-center justify-between rounded-lg border border-border/60 bg-card p-4"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                {start.toLocaleString("es-AR", {
                  weekday: "short",
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {a.customer_name ?? "Sin nombre"}
                {a.note ? ` · ${a.note}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge variant="outline" className="text-xs">
                {STATUS_LABELS[a.status] ?? a.status}
              </Badge>
              {canManage && (
                <div className="flex gap-1">
                  <button
                    onClick={() => setStatus(a.id, "done")}
                    aria-label="Marcar realizado"
                    className="p-1.5 text-muted-foreground hover:text-emerald-500 transition-colors"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setStatus(a.id, "no_show")}
                    aria-label="Marcar no vino"
                    className="p-1.5 text-muted-foreground hover:text-amber-500 transition-colors"
                  >
                    <UserX className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setStatus(a.id, "cancelled")}
                    aria-label="Cancelar"
                    className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
