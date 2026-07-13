"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

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

export function AfipSection({
  workspaceId,
  initial,
  onSaved,
}: {
  workspaceId: string;
  initial: IntegrationData | undefined;
  onSaved: () => void;
}) {
  const [cuit, setCuit] = useState(initial?.credentials?.afip_cuit ?? "");
  const [ptoVta, setPtoVta] = useState(
    (initial?.config?.afip_pto_vta as string) ?? ""
  );
  const [cert, setCert] = useState(initial?.credentials?.afip_cert ?? "");
  const [key, setKey] = useState(initial?.credentials?.afip_key ?? "");
  const [production, setProduction] = useState(
    (initial?.config?.afip_production as boolean) ?? false
  );
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/workspace/${workspaceId}/integrations`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "afip",
          enabled: true,
          credentials: {
            afip_cuit: cuit,
            afip_cert: cert,
            afip_key: key,
          },
          config: {
            afip_pto_vta: ptoVta,
            afip_production: production,
          },
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (json.ok) {
        toast.success("Configuración de AFIP guardada");
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
      title="AFIP - Facturación Electrónica"
      description="Configura los certificados de AFIP para emitir facturas C automáticamente a tus clientes."
    >
      <div className="grid gap-4">
        <div className="space-y-2">
          <Label htmlFor="afip-cuit">CUIT Emisor</Label>
          <Input
            id="afip-cuit"
            type="text"
            placeholder="20123456789"
            value={cuit}
            onChange={(e) => setCuit(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="afip-ptovta">Punto de Venta</Label>
          <Input
            id="afip-ptovta"
            type="number"
            placeholder="1"
            value={ptoVta}
            onChange={(e) => setPtoVta(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Número de punto de venta habilitado para Factura Electrónica (WebServices) en AFIP.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="afip-cert">Certificado (.crt / .pem)</Label>
          <Textarea
            id="afip-cert"
            placeholder="-----BEGIN CERTIFICATE-----..."
            value={cert}
            onChange={(e) => setCert(e.target.value)}
            className="font-mono text-xs h-32"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="afip-key">Clave Privada (.key)</Label>
          <Textarea
            id="afip-key"
            placeholder="-----BEGIN RSA PRIVATE KEY-----..."
            value={key}
            onChange={(e) => setKey(e.target.value)}
            className="font-mono text-xs h-32"
          />
        </div>

        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label className="text-base">Modo Producción</Label>
            <p className="text-sm text-muted-foreground">
              Desactívalo para emitir comprobantes en el entorno de Homologación (Pruebas).
            </p>
          </div>
          <Switch
            checked={production}
            onCheckedChange={setProduction}
          />
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
