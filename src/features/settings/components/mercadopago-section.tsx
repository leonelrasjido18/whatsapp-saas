"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, ChevronDown, ChevronRight, CheckCircle2, Copy } from "lucide-react";
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
          <ChevronDown
            className="h-4 w-4 text-muted-foreground shrink-0"
            aria-hidden
          />
        ) : (
          <ChevronRight
            className="h-4 w-4 text-muted-foreground shrink-0"
            aria-hidden
          />
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
  const [accessToken, setAccessToken] = useState(
    initial?.credentials?.mp_access_token ?? "",
  );
  const [webhookSecret, setWebhookSecret] = useState(
    initial?.credentials?.mp_webhook_secret ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const webhookUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/webhooks/commerce-mp?workspace_id=${workspaceId}`
      : `/api/webhooks/commerce-mp?workspace_id=${workspaceId}`;

  function handleCopy() {
    navigator.clipboard.writeText(webhookUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/workspace/${workspaceId}/integrations`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "mercadopago",
          enabled: true,
          credentials: {
            mp_access_token: accessToken,
            mp_webhook_secret: webhookSecret,
          },
          config: {},
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (json.ok) {
        toast.success("Configuración de MercadoPago guardada");
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
      description="Conecta tu cuenta de MercadoPago para cobrar pedidos desde el chat usando Checkout Pro."
    >
      <div className="grid gap-4">
        <div className="space-y-2">
          <Label htmlFor="mp-access-token">Access Token</Label>
          <Input
            id="mp-access-token"
            type="password"
            placeholder="APP_USR-..."
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">
            Encuentra tu Access Token de Producción en el panel de desarrolladores de MercadoPago.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="mp-webhook-secret">Webhook Secret (HMAC)</Label>
          <Input
            id="mp-webhook-secret"
            type="password"
            placeholder="Introduce el secret provisto por MP"
            value={webhookSecret}
            onChange={(e) => setWebhookSecret(e.target.value)}
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">
            Opcional pero recomendado para mayor seguridad.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Webhook URL</Label>
          <div className="flex items-center gap-2">
            <Input
              readOnly
              value={webhookUrl}
              className="font-mono text-xs text-muted-foreground"
              aria-label="Webhook URL (solo lectura)"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopy}
              aria-label="Copiar URL del webhook"
            >
              {copied ? (
                <CheckCircle2 className="h-4 w-4 text-green-500" aria-hidden />
              ) : (
                <Copy className="h-4 w-4" aria-hidden />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Configura las Notificaciones Webhook (Topic: payment) apuntando a esta URL.
          </p>
        </div>

        <div className="pt-2">
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={saving}
            aria-busy={saving}
          >
            {saving && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden />
            )}
            Guardar
          </Button>
        </div>
      </div>
    </Section>
  );
}
