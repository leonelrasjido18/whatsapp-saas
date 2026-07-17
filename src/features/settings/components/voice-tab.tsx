"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Phone, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface VoiceConfig {
  enabled: boolean;
  hasApiKey: boolean;
  assistantId: string | null;
}

export function VoiceTab({ workspaceId }: { workspaceId: string }) {
  const [config, setConfig] = useState<VoiceConfig | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/workspace/${workspaceId}/voice`);
      const json = (await res.json()) as { data?: VoiceConfig };
      if (json.data) setConfig(json.data);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load resets loading before fetch
    load();
  }, [load]);

  async function saveKey() {
    if (!apiKey.trim()) return toast.error("Pegá tu API key de Vapi");
    setSaving(true);
    try {
      const res = await fetch(`/api/workspace/${workspaceId}/voice`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      });
      if (!res.ok) throw new Error();
      toast.success("API key guardada");
      setApiKey("");
      load();
    } catch {
      toast.error("No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  async function sync() {
    setSyncing(true);
    try {
      const res = await fetch(`/api/workspace/${workspaceId}/voice`, {
        method: "POST",
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || "Error");
      toast.success("Asistente sincronizado");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al sincronizar");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-display text-sm font-medium text-foreground flex items-center gap-1.5">
          <Phone className="h-4 w-4 text-primary" aria-hidden />
          IA telefónica
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Un asistente de voz atiende llamados, usa el catálogo/agenda del
          negocio y registra la llamada en el inbox. Corre sobre{" "}
          <a
            href="https://vapi.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Vapi
          </a>{" "}
          (proveedor de voz en tiempo real).
        </p>
      </div>

      <ol className="list-decimal pl-5 space-y-1 text-xs text-muted-foreground">
        <li>Creá una cuenta en vapi.ai y generá una API key.</li>
        <li>Pegala acá abajo y guardá.</li>
        <li>Tocá &quot;Sincronizar asistente&quot; — armamos el asistente con el prompt y las tools del negocio.</li>
        <li>
          En el panel de Vapi, comprá o importá un número de teléfono y
          asignalo al asistente creado (ese paso es manual, tiene facturación
          propia de Vapi).
        </li>
      </ol>

      <div className="space-y-2">
        <Label htmlFor="vapi-key">API Key de Vapi</Label>
        <Input
          id="vapi-key"
          type="password"
          placeholder="vapi_..."
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          autoComplete="off"
        />
        <Button size="sm" onClick={saveKey} disabled={saving}>
          {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
          Guardar
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : (
        <div className="rounded-lg border border-border/60 p-4 space-y-2">
          <p className="text-xs text-muted-foreground">
            API key: {config?.hasApiKey ? "configurada ✅" : "sin configurar"}
          </p>
          <p className="text-xs text-muted-foreground">
            Asistente: {config?.assistantId ? config.assistantId : "sin sincronizar"}
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={sync}
            disabled={syncing || !config?.hasApiKey}
          >
            {syncing ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            )}
            Sincronizar asistente
          </Button>
        </div>
      )}
    </div>
  );
}
