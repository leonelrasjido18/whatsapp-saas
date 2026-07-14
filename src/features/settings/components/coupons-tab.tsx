"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Ticket, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { formatArs } from "@/features/commerce/lib/money";

interface Coupon {
  id: string;
  code: string;
  discount_type: "percent" | "amount";
  discount_value: number;
  min_order_total: number;
  max_uses: number | null;
  uses: number;
  active: boolean;
  expires_at: string | null;
}

export function CouponsTab({ workspaceId }: { workspaceId: string }) {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [code, setCode] = useState("");
  const [type, setType] = useState<"percent" | "amount">("percent");
  const [value, setValue] = useState("10");
  const [minTotal, setMinTotal] = useState("0");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/workspace/${workspaceId}/coupons`);
      const json = (await res.json()) as { data?: Coupon[] };
      setCoupons(json.data ?? []);
    } catch {
      toast.error("No se pudieron cargar los cupones");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load resets loading before fetch
    load();
  }, [load]);

  async function add() {
    if (code.trim().length < 2) return toast.error("Código muy corto");
    setSaving(true);
    try {
      const res = await fetch(`/api/workspace/${workspaceId}/coupons`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim(),
          discount_type: type,
          discount_value: Number(value),
          min_order_total: Number(minTotal),
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Error");
      toast.success("Cupón creado");
      setCode("");
      setValue("10");
      setMinTotal("0");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  async function toggle(c: Coupon) {
    try {
      await fetch(`/api/workspace/${workspaceId}/coupons/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !c.active }),
      });
      setCoupons((prev) =>
        prev.map((x) => (x.id === c.id ? { ...x, active: !x.active } : x)),
      );
    } catch {
      toast.error("No se pudo actualizar");
    }
  }

  async function remove(id: string) {
    try {
      await fetch(`/api/workspace/${workspaceId}/coupons/${id}`, {
        method: "DELETE",
      });
      setCoupons((prev) => prev.filter((c) => c.id !== id));
    } catch {
      toast.error("No se pudo eliminar");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-display text-sm font-medium text-foreground">
          Cupones de descuento
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          La IA puede aplicar estos cupones cuando el cliente los menciona en el
          chat, y descontarlos automáticamente del pedido.
        </p>
      </div>

      <div className="rounded-lg border border-border/60 p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="c-code">Código</Label>
            <Input
              id="c-code"
              value={code}
              placeholder="VERANO10"
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-type">Tipo</Label>
            <select
              id="c-type"
              value={type}
              onChange={(e) => setType(e.target.value as "percent" | "amount")}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
            >
              <option value="percent">Porcentaje %</option>
              <option value="amount">Monto fijo $</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-value">
              {type === "percent" ? "% descuento" : "$ descuento"}
            </Label>
            <Input
              id="c-value"
              type="number"
              min={1}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-min">Mínimo de compra</Label>
            <Input
              id="c-min"
              type="number"
              min={0}
              value={minTotal}
              onChange={(e) => setMinTotal(e.target.value)}
            />
          </div>
        </div>
        <Button size="sm" onClick={add} disabled={saving}>
          {saving ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <Plus className="h-4 w-4 mr-1.5" />
          )}
          Crear cupón
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-8">Cargando…</p>
      ) : coupons.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border/60 py-12 text-center">
          <Ticket className="h-8 w-8 text-muted-foreground/50" aria-hidden />
          <p className="text-sm text-muted-foreground">Todavía no hay cupones.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {coupons.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between rounded-lg border border-border/60 bg-card p-4"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-semibold">{c.code}</span>
                  <Badge variant="outline" className="text-xs">
                    {c.discount_type === "percent"
                      ? `${c.discount_value}%`
                      : formatArs(c.discount_value)}
                  </Badge>
                  {!c.active && (
                    <Badge variant="outline" className="text-xs text-muted-foreground">
                      Inactivo
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {c.uses} usos
                  {c.max_uses ? ` / ${c.max_uses}` : ""}
                  {c.min_order_total > 0
                    ? ` · mínimo ${formatArs(c.min_order_total)}`
                    : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={c.active} onCheckedChange={() => toggle(c)} />
                <button
                  onClick={() => remove(c.id)}
                  aria-label="Eliminar cupón"
                  className="p-2 text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
