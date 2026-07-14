"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Loader2, Copy, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";

interface WebchatSettings {
  enabled: boolean;
  public_key: string;
  allowed_origin: string | null;
  title: string;
  color: string;
  welcome_message: string | null;
}

export function WebchatTab({ workspaceId }: { workspaceId: string }) {
  const [settings, setSettings] = useState<WebchatSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [enabled, setEnabled] = useState(false);
  const [title, setTitle] = useState("");
  const [color, setColor] = useState("#2563eb");
  const [welcome, setWelcome] = useState("");
  const [allowedOrigin, setAllowedOrigin] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/workspace/${workspaceId}/webchat`);
      const json = (await res.json()) as { data?: WebchatSettings };
      if (json.data) {
        setSettings(json.data);
        setEnabled(json.data.enabled);
        setTitle(json.data.title);
        setColor(json.data.color);
        setWelcome(json.data.welcome_message ?? "");
        setAllowedOrigin(json.data.allowed_origin ?? "");
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
      const res = await fetch(`/api/workspace/${workspaceId}/webchat`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          title,
          color,
          welcome_message: welcome.trim() || null,
          allowed_origin: allowedOrigin.trim() || null,
        }),
      });
      const json = (await res.json()) as { data?: WebchatSettings; error?: string };
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

  function copySnippet() {
    if (!settings) return;
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    const snippet = `<script src="${origin}/widget.js" data-key="${settings.public_key}" data-color="${color}" data-title="${title.replace(/"/g, "&quot;")}"></script>`;
    navigator.clipboard.writeText(snippet).then(
      () => toast.success("Código copiado"),
      () => toast.error("No se pudo copiar"),
    );
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
  const snippet = settings
    ? `<script src="${origin}/widget.js" data-key="${settings.public_key}" data-color="${color}" data-title="${title}"></script>`
    : "";

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-display text-sm font-medium text-foreground">
          Widget de chat para tu web
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Pegá un fragmento de código en tu sitio y la misma IA que atiende
          WhatsApp responderá también a los visitantes de tu página.
        </p>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border/50 p-4">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-primary" aria-hidden />
          <Label htmlFor="webchat-enabled" className="cursor-pointer">
            Activar widget web
          </Label>
        </div>
        <Switch
          id="webchat-enabled"
          checked={enabled}
          onCheckedChange={setEnabled}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="wc-title">Título del widget</Label>
          <Input
            id="wc-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wc-color">Color</Label>
          <div className="flex items-center gap-2">
            <input
              id="wc-color"
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

      <div className="space-y-1.5">
        <Label htmlFor="wc-welcome">Mensaje de bienvenida</Label>
        <Input
          id="wc-welcome"
          value={welcome}
          onChange={(e) => setWelcome(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="wc-origin">
          Dominio permitido{" "}
          <span className="text-muted-foreground font-normal">(opcional)</span>
        </Label>
        <Input
          id="wc-origin"
          type="url"
          value={allowedOrigin}
          placeholder="https://tutienda.com"
          onChange={(e) => setAllowedOrigin(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Si lo completás, el widget solo funcionará desde ese dominio.
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

      {settings && (
        <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-4">
          <div className="flex items-center justify-between">
            <Label>Código para tu web</Label>
            <Button size="sm" variant="outline" onClick={copySnippet}>
              <Copy className="h-3.5 w-3.5 mr-1.5" aria-hidden />
              Copiar
            </Button>
          </div>
          <pre className="text-xs bg-card border border-border/60 rounded p-3 overflow-x-auto font-mono">
            {snippet}
          </pre>
          <p className="text-xs text-muted-foreground">
            Pegá este código antes de cerrar la etiqueta &lt;/body&gt; de tu
            sitio.
          </p>
        </div>
      )}
    </div>
  );
}
