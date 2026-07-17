"use client";

import { useEffect, useState, useTransition, useCallback } from "react";
import { toast } from "sonner";
import {
  Loader2,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { Facebook, Instagram } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSearchParams } from "next/navigation";

// Reuse select styling matching the integrations tab
const SELECT_CLASS =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

type PageCandidate = {
  pageId: string;
  name: string;
  igAccountId: string | null;
  igUsername: string | null;
};

type IntegrationData = {
  provider: "meta";
  enabled: boolean;
  credentials: Record<string, string>;
  oauth_tokens: Record<string, string>;
  config: Record<string, unknown>;
};

interface MetaSectionProps {
  workspaceId: string;
  initial: IntegrationData | undefined;
  onSaved: () => void;
}

export function MetaSection({ workspaceId, initial, onSaved }: MetaSectionProps) {
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [testing, setTesting] = useState(false);
  const [candidates, setCandidates] = useState<PageCandidate[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [selectedPageId, setSelectedPageId] = useState<string>("");

  // Config parameters
  const [bufferSeconds, setBufferSeconds] = useState<number>(
    (initial?.config?.buffer_silence_seconds as number | undefined) ?? 30,
  );
  const [messagesInMemory, setMessagesInMemory] = useState<number>(
    (initial?.config?.message_history_window as number | undefined) ?? 10,
  );
  const [commentToDm, setCommentToDm] = useState<boolean>(
    (initial?.config?.comment_to_dm as boolean | undefined) ?? false,
  );

  const isPendingSelection = initial?.config?.pending_selection === true;
  const isConnected = initial?.enabled === true && !isPendingSelection;
  const reconnectRequired = initial?.config?.reconnect_required === true;



  // Read URL query params for OAuth success/error feedback
  useEffect(() => {
    const metaParam = searchParams.get("meta");
    const metaError = searchParams.get("meta_error");

    if (metaParam === "select_page") {
      toast.info("Inicio de sesión exitoso. Selecciona una página de Facebook.");
    }
    if (metaError) {
      toast.error(`Error de conexión con Meta: ${metaError}`);
    }
  }, [searchParams]);

  const loadCandidates = useCallback(async () => {
    setLoadingCandidates(true);
    try {
      const res = await fetch(`/api/integrations/meta/pages?wsid=${workspaceId}`);
      if (!res.ok) throw new Error("Failed to load pages");
      const json = await res.json() as { pages?: PageCandidate[] };
      const pages = json.pages ?? [];
      setCandidates(pages);
      if (pages.length > 0) {
        setSelectedPageId(pages[0].pageId);
      }
    } catch {
      toast.error("Error al cargar las páginas candidatos de Meta");
    } finally {
      setLoadingCandidates(false);
    }
  }, [workspaceId]);

  // Load page candidates when pending selection
  useEffect(() => {
    if (isPendingSelection) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: fetch candidates sets loading state inside effect
      loadCandidates();
    }
  }, [isPendingSelection, loadCandidates]);

  function handleConnect() {
    // Redirects to start OAuth flow
    window.location.href = `/api/integrations/meta/oauth/start?wsid=${workspaceId}`;
  }

  async function handleSelectPage() {
    if (!selectedPageId) {
      toast.error("Por favor selecciona una página.");
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch("/api/integrations/meta/select-page", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId, pageId: selectedPageId }),
        });
        const json = await res.json() as { ok?: boolean; error?: string };
        if (json.ok) {
          toast.success("Página conectada con éxito");
          onSaved();
        } else {
          toast.error(json.error ?? "Error al seleccionar página");
        }
      } catch {
        toast.error("Error de red al seleccionar página");
      }
    });
  }

  async function handleSaveSettings() {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/workspace/${workspaceId}/integrations`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: "meta",
            config: {
              buffer_silence_seconds: bufferSeconds,
              message_history_window: messagesInMemory,
              comment_to_dm: commentToDm,
            },
          }),
        });
        const json = await res.json() as { ok?: boolean; error?: string };
        if (json.ok) {
          toast.success("Configuración de Meta guardada");
          onSaved();
        } else {
          toast.error(json.error ?? "Error al guardar configuración");
        }
      } catch {
        toast.error("Error de red al guardar configuración");
      }
    });
  }

  async function handleTestConnection() {
    setTesting(true);
    try {
      const res = await fetch("/api/integrations/meta/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      const json = await res.json() as {
        ok: boolean;
        error?: string;
        pageName?: string;
        igUsername?: string | null;
      };
      if (json.ok) {
        let details = `Página: ${json.pageName}`;
        if (json.igUsername) {
          details += ` + Instagram: @${json.igUsername}`;
        }
        toast.success(`Conexión exitosa. ${details}`);
      } else {
        toast.error(json.error ?? "Error al probar conexión");
        onSaved(); // Reload config flag if reconnect_required changed
      }
    } catch {
      toast.error("Error de red al probar conexión");
    } finally {
      setTesting(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm("¿Estás seguro de desconectar Facebook e Instagram? No perderás el historial de chats.")) {
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch("/api/integrations/meta/disconnect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId }),
        });
        const json = await res.json() as { ok?: boolean; error?: string };
        if (json.ok) {
          toast.success("Facebook e Instagram desconectados");
          onSaved();
        } else {
          toast.error(json.error ?? "Error al desconectar");
        }
      } catch {
        toast.error("Error de red al desconectar");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-base font-medium text-foreground flex items-center gap-2">
          Facebook Messenger & Instagram DM
          <span className="flex items-center gap-1">
            <Facebook className="h-4 w-4 text-[#1877F2]" />
            <Instagram className="h-4 w-4 text-[#E4405F]" />
          </span>
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Conecta tus páginas de Facebook y cuentas comerciales de Instagram para centralizar tus chats con IA.
        </p>
      </div>

      {/* State: Not connected */}
      {!isConnected && !isPendingSelection && (
        <div className="pt-2">
          <Button
            type="button"
            onClick={handleConnect}
            disabled={isPending}
            className="bg-[#1877F2] hover:bg-[#1877F2]/90 text-white font-medium flex items-center gap-2"
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Conectar Facebook / Instagram
          </Button>
        </div>
      )}

      {/* State: Pending Page Selection */}
      {isPendingSelection && (
        <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-4">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-foreground">Selección de página pendiente</p>
              <p className="text-xs text-muted-foreground">
                Selecciona la página de Facebook que deseas activar en este espacio de trabajo.
              </p>
            </div>
          </div>

          {loadingCandidates ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando páginas y cuentas vinculadas...
            </div>
          ) : candidates.length === 0 ? (
            <div className="text-sm text-muted-foreground py-2 space-y-2">
              <p>No se encontraron páginas de Facebook conectadas a la aplicación.</p>
              <Button type="button" variant="outline" size="sm" onClick={loadCandidates}>
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Reintentar
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-2">
                {candidates.map((c) => (
                  <label
                    key={c.pageId}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedPageId === c.pageId
                        ? "bg-primary/5 border-primary"
                        : "border-border/60 hover:bg-muted/40"
                    }`}
                  >
                    <input
                      type="radio"
                      name="meta-page-select"
                      value={c.pageId}
                      checked={selectedPageId === c.pageId}
                      onChange={() => setSelectedPageId(c.pageId)}
                      className="mt-1"
                    />
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p className="text-sm font-medium text-foreground">{c.name}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-3">
                        <span className="flex items-center gap-1 font-mono">ID: {c.pageId}</span>
                        {c.igUsername && (
                          <span className="flex items-center gap-1 text-[#E4405F]">
                            <Instagram className="h-3.5 w-3.5" /> @{c.igUsername}
                          </span>
                        )}
                      </p>
                    </div>
                  </label>
                ))}
              </div>

              <div className="flex items-center gap-2 pt-1">
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSelectPage}
                  disabled={isPending || !selectedPageId}
                >
                  {isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                  Confirmar página y activar
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleDisconnect}
                  disabled={isPending}
                  className="text-destructive hover:bg-destructive/10"
                >
                  Cancelar conexión
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* State: Connected */}
      {isConnected && (
        <div className="space-y-4">
          {/* Reconnect Warning Alert */}
          {reconnectRequired && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="space-y-1.5 flex-1 min-w-0">
                <p className="text-sm font-medium text-amber-400">Acceso desautorizado o expirado</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Meta ha invalidado tu token de conexión (puede ocurrir por cambio de contraseña o caducidad del permiso). Vuelve a conectar tu cuenta para reestablecer la mensajería.
                </p>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleConnect}
                  disabled={isPending}
                  className="bg-amber-500 text-black hover:bg-amber-500/90 font-medium h-7 px-3 text-xs"
                >
                  {isPending && <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />}
                  Reconectar Facebook / Instagram
                </Button>
              </div>
            </div>
          )}

          {/* Connection Card */}
          <div className="rounded-lg border border-border/80 bg-muted/10 p-4 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    {initial?.config?.page_name as string ?? "Página conectada"}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400 border border-emerald-500/20">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Activo
                  </span>
                </div>
                <p className="text-xs text-muted-foreground font-mono">
                  Page ID: {initial?.config?.page_id as string}
                </p>
                {!!initial?.config?.ig_username && (
                  <div className="flex items-center gap-1.5 text-xs text-foreground/80 mt-1">
                    <Instagram className="h-3.5 w-3.5 text-[#E4405F]" />
                    <span>Instagram:</span>
                    <span className="font-semibold text-[#E4405F]">@{initial.config.ig_username as string}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleTestConnection}
                  disabled={testing}
                  className="h-8 text-xs gap-1.5"
                >
                  {testing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  Probar
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleDisconnect}
                  disabled={isPending}
                  className="h-8 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  {isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                  Desconectar
                </Button>
              </div>
            </div>
          </div>

          {/* Config Parameters form */}
          <div className="grid gap-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="meta-buffer-seconds">Ventana de silencio buffer (segundos)</Label>
              <Input
                id="meta-buffer-seconds"
                type="number"
                min={3}
                max={120}
                value={bufferSeconds}
                onChange={(e) => setBufferSeconds(Number(e.target.value))}
              />
              <p className="text-[11px] text-muted-foreground">
                Tiempo de espera después del último mensaje del usuario para consolidar y responder con la IA.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="meta-history-window">Historial de memoria (mensajes)</Label>
              <select
                id="meta-history-window"
                value={messagesInMemory}
                onChange={(e) => setMessagesInMemory(Number(e.target.value))}
                className={SELECT_CLASS}
              >
                {[5, 10, 15, 20, 30, 40, 50].map((val) => (
                  <option key={val} value={val}>
                    {val} mensajes
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground">
                Número de mensajes previos pasados a la IA para tener memoria del contexto.
              </p>
            </div>

            <div className="flex items-start justify-between gap-3 rounded-lg border border-border/60 p-3">
              <div>
                <Label htmlFor="meta-comment-dm" className="cursor-pointer">
                  Responder comentarios por privado (DM)
                </Label>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Cuando alguien comenta un post de Facebook/Instagram, la IA le
                  escribe al privado y sigue la conversación. Requiere que la app
                  de Meta esté suscrita a los comentarios.
                </p>
              </div>
              <input
                id="meta-comment-dm"
                type="checkbox"
                checked={commentToDm}
                onChange={(e) => setCommentToDm(e.target.checked)}
                className="mt-1 h-4 w-4"
              />
            </div>

            <div className="pt-2">
              <Button
                type="button"
                size="sm"
                onClick={handleSaveSettings}
                disabled={isPending}
                className="font-medium"
              >
                {isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                Guardar Configuración
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
