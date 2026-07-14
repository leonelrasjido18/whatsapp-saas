"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Loader2, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Branding {
  brand_name: string;
  logo_url: string | null;
  primary_color: string;
  support_email: string | null;
}

export function BrandingEditor() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [brandName, setBrandName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [color, setColor] = useState("#2563eb");
  const [supportEmail, setSupportEmail] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/agency/branding");
      const json = (await res.json()) as { data?: Branding };
      if (json.data) {
        setBrandName(json.data.brand_name);
        setLogoUrl(json.data.logo_url ?? "");
        setColor(json.data.primary_color);
        setSupportEmail(json.data.support_email ?? "");
      }
    } catch {
      toast.error("No se pudo cargar la marca");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load resets loading before fetch
    load();
  }, [load]);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/agency/branding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand_name: brandName.trim() || "Agente WA",
          logo_url: logoUrl.trim() || null,
          primary_color: color,
          support_email: supportEmail.trim() || null,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(
          typeof json.error === "string" ? json.error : "Error al guardar",
        );
      }
      toast.success("Marca guardada. Se aplica al recargar.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="text-sm text-muted-foreground">Cargando marca…</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Palette className="h-4 w-4 text-primary" aria-hidden />
        <h2 className="font-display text-sm font-semibold">
          Marca de la plataforma (white-label)
        </h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Personalizá el nombre, logo y color con los que tus clientes ven la
        plataforma. Se aplica a toda la instancia.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="b-name">Nombre de la marca</Label>
          <Input
            id="b-name"
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="b-color">Color principal</Label>
          <div className="flex items-center gap-2">
            <input
              id="b-color"
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
        <Label htmlFor="b-logo">URL del logo (opcional)</Label>
        <Input
          id="b-logo"
          type="url"
          value={logoUrl}
          placeholder="https://…/logo.png"
          onChange={(e) => setLogoUrl(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Si lo cargás, reemplaza el nombre en el encabezado.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="b-email">Email de soporte (opcional)</Label>
        <Input
          id="b-email"
          type="email"
          value={supportEmail}
          onChange={(e) => setSupportEmail(e.target.value)}
        />
      </div>

      <Button onClick={save} disabled={saving} aria-busy={saving}>
        {saving ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Guardando…
          </>
        ) : (
          "Guardar marca"
        )}
      </Button>
    </div>
  );
}
