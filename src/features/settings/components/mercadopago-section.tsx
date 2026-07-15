"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Link2,
  Unlink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type IntegrationData = {
  provider: string;
  enabled: boolean;
  credentials: Record<string, string>;
  oauth_tokens: Record<string, string>;
  config: Record<string, unknown>;
};

function Section({
  title,
  description,
  defaultOpen = false,
  children,
}: {
  title: string;
  description: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-left"
        aria-expanded={open}
      >
        <div>
          <h2 className="font-display text-base font-medium text-foreground">
            {title}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        </div>
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
        )}
      </button>

      {open && <div className="space-y-4 pt-2">{children}</div>}
    </div>
  );
}

export function MercadoPagoSection({
  workspaceId,
  initial,
  onSaved,
}: {
  workspaceId: string;
  initial: IntegrationData | undefined;
  onSaved: () => void;
}) {
  // Connected via OAuth when the masked oauth_tokens object has any keys.
  const connected = Boolean(
    initial?.oauth_tokens && Object.keys(initial.oauth_tokens).length > 0,
  );

  const [accessToken, setAccessToken] = useState(
    initial?.credentials?.mp_access_token ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      const res = await fetch(
        `/api/integrations/mercadopago/disconnect?wsid=${workspaceId}`,
        { method: "POST" },
      );
      if (!res.ok) throw new Error();
      toast.success("MercadoPago desconectado");
      onSaved();
    } catch {
      toast.error("No se pudo desconectar");
    } finally {
      setDisconnecting(false);
    }
  }

  async function handleSaveManual() {
    setSaving(true);
    try {
      const res = await fetch(`/api/workspace/${workspaceId}/integrations`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "mercadopago",
          enabled: true,
          credentials: { mp_access_token: accessToken },
          config: {},
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (json.ok) {
        toast.success("Access Token guardado");
        onSaved();
      } else {
        toast.error(json.error ?? "Error al guardar");
      }
    } catch {
      toast.error("Error de red al guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section
      title="MercadoPago"
      description="Conecta tu cuenta de MercadoPago para cobrar pedidos desde el chat."
    >
      {/* Estado de conexión + botón principal */}
      {connected ? (
        <div className="flex items-center justify-between rounded-lg border border-success/30 bg-success/5 p-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-success" aria-hidden />
            <div>
              <p className="text-sm font-medium text-foreground">
                Cuenta conectada
              </p>
              <p className="text-xs text-muted-foreground">
                Los pagos se acreditan directo en tu cuenta de MercadoPago.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDisconnect}
            disabled={disconnecting}
          >
            {disconnecting ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" aria-hidden />
            ) : (
              <Unlink className="h-4 w-4 mr-1.5" aria-hidden />
            )}
            Desconectar
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
          <p className="text-sm text-foreground">
            Conectá tu cuenta con un clic. Te llevamos a MercadoPago, iniciás
            sesión y autorizás — sin copiar claves ni configurar nada.
          </p>
          <Button asChild>
            <a href={`/api/integrations/mercadopago/start?wsid=${workspaceId}`}>
              <Link2 className="h-4 w-4 mr-1.5" aria-hidden />
              Conectar con Mercado Pago
            </a>
          </Button>
        </div>
      )}

      {/* Opción avanzada: pegar el Access Token manualmente (fallback) */}
      <details className="group">
        <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground select-none">
          Opción avanzada: pegar el Access Token manualmente
        </summary>
        <div className="mt-3 space-y-2">
          <Label htmlFor="mp-access-token">Access Token de producción</Label>
          <Input
            id="mp-access-token"
            type="password"
            placeholder="APP_USR-..."
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">
            Solo si preferís no usar la conexión con un clic. Lo encontrás en el
            panel de desarrolladores de MercadoPago.
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleSaveManual}
            disabled={saving}
          >
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden />}
            Guardar token manual
          </Button>
        </div>
      </details>
    </Section>
  );
}
