"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Loader2, Star, MousePointerClick, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";

interface ReviewSettings {
  enabled: boolean;
  review_url: string | null;
  delay_hours: number;
  requests_sent: number;
  clicks: number;
}

export function ReviewsTab({ workspaceId }: { workspaceId: string }) {
  const [settings, setSettings] = useState<ReviewSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [enabled, setEnabled] = useState(false);
  const [reviewUrl, setReviewUrl] = useState("");
  const [delayHours, setDelayHours] = useState(24);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/workspace/${workspaceId}/reviews`);
      const json = (await res.json()) as { data?: ReviewSettings };
      if (json.data) {
        setSettings(json.data);
        setEnabled(json.data.enabled);
        setReviewUrl(json.data.review_url ?? "");
        setDelayHours(json.data.delay_hours);
      }
    } catch {
      toast.error("No se pudo cargar la configuración");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load resets loading before fetch
    load();
  }, [load]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/workspace/${workspaceId}/reviews`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          review_url: reviewUrl.trim() || null,
          delay_hours: delayHours,
        }),
      });
      const json = (await res.json()) as { data?: ReviewSettings; error?: string };
      if (!res.ok) {
        throw new Error(
          typeof json.error === "string" ? json.error : "Error al guardar",
        );
      }
      if (json.data) setSettings(json.data);
      toast.success("Configuración guardada");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-display text-sm font-medium text-foreground">
          Reseñas de Google automáticas
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Después de cada venta, la IA le pide al cliente que deje una reseña con
          un enlace directo. Las reseñas de Google valen oro para un local.
        </p>
      </div>

      {settings && (settings.requests_sent > 0 || settings.clicks > 0) && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border/50 bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Send className="h-4 w-4" aria-hidden />
              <span className="text-xs font-medium">Pedidos enviados</span>
            </div>
            <p className="font-display text-2xl font-semibold mt-1 tabular-nums">
              {settings.requests_sent}
            </p>
          </div>
          <div className="rounded-lg border border-border/50 bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <MousePointerClick className="h-4 w-4" aria-hidden />
              <span className="text-xs font-medium">Clicks al enlace</span>
            </div>
            <p className="font-display text-2xl font-semibold mt-1 tabular-nums">
              {settings.clicks}
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between rounded-lg border border-border/50 p-4">
        <div className="flex items-center gap-2">
          <Star className="h-4 w-4 text-amber-400" aria-hidden />
          <Label htmlFor="reviews-enabled" className="cursor-pointer">
            Activar pedido de reseñas
          </Label>
        </div>
        <Switch
          id="reviews-enabled"
          checked={enabled}
          onCheckedChange={setEnabled}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="review-url">Enlace de reseña de Google</Label>
        <Input
          id="review-url"
          type="url"
          value={reviewUrl}
          placeholder="https://g.page/r/…/review"
          onChange={(e) => setReviewUrl(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          En tu perfil de Google Business → Pedir reseñas → copiá el enlace corto.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="delay-hours">Horas después de la venta</Label>
        <Input
          id="delay-hours"
          type="number"
          min={1}
          max={168}
          value={delayHours}
          onChange={(e) => setDelayHours(Number(e.target.value))}
          className="w-32"
        />
        <p className="text-xs text-muted-foreground">
          Cuánto esperar tras el pago antes de pedir la reseña (1 a 168 h).
        </p>
      </div>

      <Button onClick={handleSave} disabled={saving} aria-busy={saving}>
        {saving ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden />
            Guardando…
          </>
        ) : (
          "Guardar"
        )}
      </Button>
    </div>
  );
}
