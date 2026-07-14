"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

interface Rule {
  weekday: number;
  start_time: string;
  end_time: string;
}

const WEEKDAYS = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
];

interface DayState {
  open: boolean;
  start: string;
  end: string;
}

function defaultDays(): DayState[] {
  return WEEKDAYS.map((_, i) => ({
    open: i >= 1 && i <= 5, // Mon–Fri open by default
    start: "09:00",
    end: "18:00",
  }));
}

export default function HoursTab({
  workspaceId,
  canManage,
}: {
  workspaceId: string;
  canManage: boolean;
}) {
  const [days, setDays] = useState<DayState[]>(defaultDays());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/workspace/${workspaceId}/booking/availability`,
      );
      const json = (await res.json()) as { data?: Rule[] };
      const rules = json.data ?? [];
      if (rules.length > 0) {
        const next = defaultDays().map((d, i) => {
          const rule = rules.find((r) => r.weekday === i);
          return rule
            ? {
                open: true,
                start: rule.start_time.slice(0, 5),
                end: rule.end_time.slice(0, 5),
              }
            : { ...d, open: false };
        });
        setDays(next);
      }
    } catch {
      toast.error("No se pudieron cargar los horarios");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load resets loading before fetch
    load();
  }, [load]);

  function update(i: number, patch: Partial<DayState>) {
    setDays((prev) => prev.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  }

  async function save() {
    setSaving(true);
    try {
      const rules: Rule[] = days
        .map((d, i) => ({ ...d, weekday: i }))
        .filter((d) => d.open)
        .map((d) => ({
          weekday: d.weekday,
          start_time: d.start,
          end_time: d.end,
        }));

      const res = await fetch(
        `/api/workspace/${workspaceId}/booking/availability`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rules }),
        },
      );
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Error");
      toast.success("Horarios guardados");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Cargando…</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Definí los horarios en los que tomás turnos. La IA solo ofrecerá horarios
        dentro de estas franjas.
      </p>

      <div className="space-y-2">
        {days.map((d, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-lg border border-border/60 bg-card p-3"
          >
            <div className="w-28 flex items-center gap-2">
              <Switch
                checked={d.open}
                onCheckedChange={(v) => update(i, { open: v })}
                disabled={!canManage}
                aria-label={`Abierto ${WEEKDAYS[i]}`}
              />
              <span className="text-sm">{WEEKDAYS[i]}</span>
            </div>
            {d.open ? (
              <div className="flex items-center gap-2">
                <Input
                  type="time"
                  value={d.start}
                  onChange={(e) => update(i, { start: e.target.value })}
                  disabled={!canManage}
                  className="w-28"
                />
                <span className="text-muted-foreground text-sm">a</span>
                <Input
                  type="time"
                  value={d.end}
                  onChange={(e) => update(i, { end: e.target.value })}
                  disabled={!canManage}
                  className="w-28"
                />
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">Cerrado</span>
            )}
          </div>
        ))}
      </div>

      {canManage && (
        <Button onClick={save} disabled={saving} aria-busy={saving}>
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Guardando…
            </>
          ) : (
            "Guardar horarios"
          )}
        </Button>
      )}
    </div>
  );
}
