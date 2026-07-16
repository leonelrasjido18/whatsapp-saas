"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatArs } from "@/features/commerce/lib/money";

interface Service {
  id: string;
  name: string;
  duration_min: number;
  price: number;
  deposit_amount?: number;
}

export default function ServicesTab({
  workspaceId,
  canManage,
}: {
  workspaceId: string;
  canManage: boolean;
}) {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [duration, setDuration] = useState("30");
  const [price, setPrice] = useState("0");
  const [deposit, setDeposit] = useState("0");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/workspace/${workspaceId}/booking/services`);
      const json = (await res.json()) as { data?: Service[] };
      setServices(json.data ?? []);
    } catch {
      toast.error("No se pudieron cargar los servicios");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load resets loading before fetch
    load();
  }, [load]);

  async function add() {
    if (!name.trim()) return toast.error("Poné un nombre");
    setSaving(true);
    try {
      const res = await fetch(`/api/workspace/${workspaceId}/booking/services`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          duration_min: Number(duration),
          price: Number(price),
          deposit_amount: Number(deposit) || 0,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Servicio agregado");
      setName("");
      setDuration("30");
      setPrice("0");
      setDeposit("0");
      load();
    } catch {
      toast.error("No se pudo agregar");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    try {
      const res = await fetch(
        `/api/workspace/${workspaceId}/booking/services/${id}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error();
      toast.success("Servicio eliminado");
      setServices((prev) => prev.filter((s) => s.id !== id));
    } catch {
      toast.error("No se pudo eliminar");
    }
  }

  return (
    <div className="space-y-6">
      {canManage && (
        <div className="rounded-lg border border-border/60 p-4 space-y-3">
          <p className="text-sm font-medium">Nuevo servicio</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="s-name">Nombre</Label>
              <Input
                id="s-name"
                value={name}
                placeholder="Corte de pelo"
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-dur">Duración (min)</Label>
              <Input
                id="s-dur"
                type="number"
                min={5}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-price">Precio</Label>
              <Input
                id="s-price"
                type="number"
                min={0}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-deposit">Seña (opcional)</Label>
              <Input
                id="s-deposit"
                type="number"
                min={0}
                value={deposit}
                onChange={(e) => setDeposit(e.target.value)}
              />
            </div>
          </div>
          <Button size="sm" onClick={add} disabled={saving}>
            <Plus className="h-4 w-4 mr-1.5" />
            Agregar
          </Button>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-8">Cargando…</p>
      ) : services.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          No hay servicios cargados.
        </p>
      ) : (
        <ul className="space-y-2">
          {services.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between rounded-lg border border-border/60 bg-card p-4"
            >
              <div>
                <p className="text-sm font-medium">{s.name}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                  <Clock className="h-3 w-3" /> {s.duration_min} min ·{" "}
                  {formatArs(s.price)}
                  {s.deposit_amount != null && s.deposit_amount > 0 && (
                    <span className="text-amber-600 dark:text-amber-400">
                      · seña {formatArs(s.deposit_amount)}
                    </span>
                  )}
                </p>
              </div>
              {canManage && (
                <button
                  onClick={() => remove(s.id)}
                  aria-label="Eliminar servicio"
                  className="p-2 text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
