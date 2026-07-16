"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Loader2, Copy, Store, ExternalLink, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";

interface StorefrontSettings {
  enabled: boolean;
  public_key: string;
  headline: string | null;
  subheadline: string | null;
  whatsapp_phone: string | null;
  accent_color: string;
  show_prices: boolean;
}

export function StorefrontTab({ workspaceId }: { workspaceId: string }) {
  const [settings, setSettings] = useState<StorefrontSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [enabled, setEnabled] = useState(false);
  const [headline, setHeadline] = useState("");
  const [subheadline, setSubheadline] = useState("");
  const [phone, setPhone] = useState("");
  const [color, setColor] = useState("#2563eb");
  const [showPrices, setShowPrices] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/workspace/${workspaceId}/storefront`);
      const json = (await res.json()) as { data?: StorefrontSettings };
      if (json.data) {
        setSettings(json.data);
        setEnabled(json.data.enabled);
        setHeadline(json.data.headline ?? "");
        setSubheadline(json.data.subheadline ?? "");
        setPhone(json.data.whatsapp_phone ?? "");
        setColor(json.data.accent_color);
        setShowPrices(json.data.show_prices);
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
      const res = await fetch(`/api/workspace/${workspaceId}/storefront`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          headline: headline.trim() || null,
          subheadline: subheadline.trim() || null,
          whatsapp_phone: phone.trim() || null,
          accent_color: color,
          show_prices: showPrices,
        }),
      });
      const json = (await res.json()) as {
        data?: StorefrontSettings;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(
          typeof json.error === "string" ? json.error : "Error al guardar",
        );
      }
      if (json.data) setSettings(json.data);
      toast.success("Tienda guardada");
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
      </div>
    );
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const publicUrl = settings ? `${origin}/tienda/${settings.public_key}` : "";
  const qrUrl = `/api/workspace/${workspaceId}/storefront/qr`;

  function copyUrl() {
    navigator.clipboard.writeText(publicUrl).then(
      () => toast.success("Link copiado"),
      () => toast.error("No se pudo copiar"),
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-display text-sm font-medium text-foreground">
          Tienda online (mini-sitio + QR)
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Una página pública con tu catálogo y fotos. Cada producto tiene un
          botón “Pedir por WhatsApp”. Compartís el link o el QR y listo.
        </p>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border/50 p-4">
        <div className="flex items-center gap-2">
          <Store className="h-4 w-4 text-primary" aria-hidden />
          <Label htmlFor="sf-enabled" className="cursor-pointer">
            Activar tienda pública
          </Label>
        </div>
        <Switch id="sf-enabled" checked={enabled} onCheckedChange={setEnabled} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="sf-headline">Título / eslogan</Label>
        <Input
          id="sf-headline"
          value={headline}
          placeholder="Los mejores productos de Salta"
          onChange={(e) => setHeadline(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="sf-sub">Subtítulo (opcional)</Label>
        <Input
          id="sf-sub"
          value={subheadline}
          placeholder="Envíos a todo el país"
          onChange={(e) => setSubheadline(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="sf-phone">
            WhatsApp para pedidos{" "}
            <span className="text-muted-foreground font-normal">(opcional)</span>
          </Label>
          <Input
            id="sf-phone"
            value={phone}
            placeholder="+54 9 387 …"
            onChange={(e) => setPhone(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Si lo dejás vacío, usa el número de WhatsApp del agente.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sf-color">Color principal</Label>
          <div className="flex items-center gap-2">
            <input
              id="sf-color"
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-9 w-14 rounded border border-input bg-background"
            />
            <Input
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-28"
            />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border/50 p-4">
        <Label htmlFor="sf-prices" className="cursor-pointer">
          Mostrar precios
        </Label>
        <Switch
          id="sf-prices"
          checked={showPrices}
          onCheckedChange={setShowPrices}
        />
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

      {settings && enabled && (
        <div className="space-y-4 rounded-lg border border-border/60 bg-muted/20 p-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Link de tu tienda</Label>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={copyUrl}>
                  <Copy className="h-3.5 w-3.5 mr-1.5" aria-hidden />
                  Copiar
                </Button>
                <a href={publicUrl} target="_blank" rel="noopener noreferrer">
                  <Button size="sm" variant="outline">
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" aria-hidden />
                    Abrir
                  </Button>
                </a>
              </div>
            </div>
            <pre className="text-xs bg-card border border-border/60 rounded p-3 overflow-x-auto font-mono">
              {publicUrl}
            </pre>
          </div>

          <div className="flex flex-col items-center gap-3 pt-2">
            <Label>Código QR</Label>
            {/* eslint-disable-next-line @next/next/no-img-element -- dynamic PNG from our API */}
            <img
              src={qrUrl}
              alt="QR de la tienda"
              width={180}
              height={180}
              className="rounded-lg border border-border/60 bg-white p-2"
            />
            <a href={qrUrl} download="tienda-qr.png">
              <Button size="sm" variant="outline">
                <Download className="h-3.5 w-3.5 mr-1.5" aria-hidden />
                Descargar QR
              </Button>
            </a>
            <p className="text-xs text-muted-foreground text-center max-w-xs">
              Imprimilo y pegalo en el mostrador, la vidriera o el packaging.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
