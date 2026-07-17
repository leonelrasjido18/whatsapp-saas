"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Plus, Trash2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Location {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  hours: string | null;
}

export function LocationsTab({ workspaceId }: { workspaceId: string }) {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [hours, setHours] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/workspace/${workspaceId}/locations`);
      const json = (await res.json()) as { data?: Location[] };
      setLocations(json.data ?? []);
    } catch {
      toast.error("No se pudieron cargar las sucursales");
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
      const res = await fetch(`/api/workspace/${workspaceId}/locations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          address: address.trim() || undefined,
          phone: phone.trim() || undefined,
          hours: hours.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Sucursal agregada");
      setName("");
      setAddress("");
      setPhone("");
      setHours("");
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
        `/api/workspace/${workspaceId}/locations?locationId=${id}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error();
      setLocations((prev) => prev.filter((l) => l.id !== id));
      toast.success("Sucursal eliminada");
    } catch {
      toast.error("No se pudo eliminar");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-display text-sm font-medium text-foreground">
          Sucursales
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Cargá tus locales. La IA los usa para orientar a los clientes (dónde
          están, horarios) y derivarlos a la sucursal correcta.
        </p>
      </div>

      <div className="rounded-lg border border-border/60 p-4 space-y-3">
        <p className="text-sm font-medium">Nueva sucursal</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="l-name">Nombre</Label>
            <Input id="l-name" value={name} placeholder="Sucursal Centro" onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="l-address">Dirección</Label>
            <Input id="l-address" value={address} placeholder="Av. Belgrano 123" onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="l-hours">Horarios</Label>
            <Input id="l-hours" value={hours} placeholder="Lun a Sáb 9 a 20" onChange={(e) => setHours(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="l-phone">Teléfono</Label>
            <Input id="l-phone" value={phone} placeholder="+54 387 …" onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>
        <Button size="sm" onClick={add} disabled={saving}>
          <Plus className="h-4 w-4 mr-1.5" />
          Agregar
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-8">Cargando…</p>
      ) : locations.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          No hay sucursales cargadas.
        </p>
      ) : (
        <ul className="space-y-2">
          {locations.map((l) => (
            <li key={l.id} className="flex items-start justify-between rounded-lg border border-border/60 bg-card p-4">
              <div className="min-w-0">
                <p className="text-sm font-medium flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-primary" /> {l.name}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {[l.address, l.hours, l.phone].filter(Boolean).join(" · ")}
                </p>
              </div>
              <button
                onClick={() => remove(l.id)}
                aria-label="Eliminar sucursal"
                className="p-2 text-muted-foreground hover:text-destructive transition-colors"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
