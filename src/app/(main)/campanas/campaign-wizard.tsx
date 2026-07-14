"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Users, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import type { CampaignSegment, CustomerTier } from "@/features/campaigns/types";

interface TemplateRow {
  id: string;
  name: string;
  language: string;
  status: string;
  body_template: string;
}

interface PreviewData {
  audienceSize: number;
  remaining: number;
  monthlyLimit: number;
  exceedsQuota: boolean;
}

const TIERS: { value: CustomerTier; label: string }[] = [
  { value: "new", label: "Nuevos" },
  { value: "regular", label: "Regulares" },
  { value: "vip", label: "VIP" },
  { value: "inactive", label: "Inactivos" },
];

export default function CampaignWizard({
  workspaceId,
  onClose,
  onCreated,
}: {
  workspaceId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);

  // Segment state
  const [tiers, setTiers] = useState<CustomerTier[]>([]);
  const [hasPurchased, setHasPurchased] = useState(false);
  const [inactiveDays, setInactiveDays] = useState<string>("");
  const [birthdayThisMonth, setBirthdayThisMonth] = useState(false);
  const [tagsInput, setTagsInput] = useState("");

  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewing, setPreviewing] = useState(false);

  // Campaign meta
  const [name, setName] = useState("");
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [templateLanguage, setTemplateLanguage] = useState("es");
  const [creating, setCreating] = useState(false);

  function buildSegment(): CampaignSegment {
    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const seg: CampaignSegment = {};
    if (tags.length) seg.tags = tags;
    if (tiers.length) seg.tiers = tiers;
    if (hasPurchased) seg.hasPurchased = true;
    if (inactiveDays && Number(inactiveDays) > 0)
      seg.inactiveDays = Number(inactiveDays);
    if (birthdayThisMonth) seg.birthdayThisMonth = true;
    return seg;
  }

  // Load approved templates for the picker.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/workspace/${workspaceId}/templates`);
        const json = (await res.json()) as { data?: TemplateRow[] };
        const approved = (json.data ?? []).filter(
          (t) => t.status === "approved",
        );
        setTemplates(approved);
      } catch {
        /* non-fatal */
      }
    })();
  }, [workspaceId]);

  async function runPreview() {
    setPreviewing(true);
    setPreview(null);
    try {
      const res = await fetch(
        `/api/workspace/${workspaceId}/campaigns/preview`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildSegment()),
        },
      );
      const json = (await res.json()) as { data?: PreviewData; error?: string };
      if (!res.ok || !json.data) throw new Error(json.error ?? "Error");
      setPreview(json.data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al calcular audiencia");
    } finally {
      setPreviewing(false);
    }
  }

  async function handleCreate(launch: boolean) {
    if (!name.trim()) return toast.error("Ponele un nombre a la campaña");
    if (!templateName) return toast.error("Elegí un template aprobado");

    setCreating(true);
    try {
      const createRes = await fetch(`/api/workspace/${workspaceId}/campaigns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          template_name: templateName,
          template_language: templateLanguage,
          segment: buildSegment(),
        }),
      });
      const createJson = (await createRes.json()) as {
        data?: { id: string };
        error?: string;
      };
      if (!createRes.ok || !createJson.data) {
        throw new Error(
          typeof createJson.error === "string" ? createJson.error : "Error al crear",
        );
      }

      if (launch) {
        const launchRes = await fetch(
          `/api/workspace/${workspaceId}/campaigns/${createJson.data.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "launch" }),
          },
        );
        const launchJson = (await launchRes.json()) as { error?: string };
        if (!launchRes.ok) {
          throw new Error(launchJson.error ?? "Se creó pero no se pudo lanzar");
        }
        toast.success("Campaña creada y en envío");
      } else {
        toast.success("Campaña guardada como borrador");
      }
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setCreating(false);
    }
  }

  function toggleTier(t: CustomerTier) {
    setTiers((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    );
    setPreview(null);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {step === 1 ? "¿A quién le llega?" : "Mensaje y envío"}
          </DialogTitle>
          <DialogDescription>
            {step === 1
              ? "Definí el segmento de clientes. Solo se incluyen contactos que aceptaron recibir mensajes."
              : "Elegí el template aprobado y confirmá el envío."}
          </DialogDescription>
        </DialogHeader>

        {step === 1 ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Tipo de cliente</Label>
              <div className="flex flex-wrap gap-2">
                {TIERS.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => toggleTier(t.value)}
                    className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                      tiers.includes(t.value)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:border-foreground/30"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tags">Etiquetas (separadas por coma)</Label>
              <Input
                id="tags"
                value={tagsInput}
                placeholder="mayorista, buenos-aires"
                onChange={(e) => {
                  setTagsInput(e.target.value);
                  setPreview(null);
                }}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="inactive">Sin comprar hace (días)</Label>
              <Input
                id="inactive"
                type="number"
                min={1}
                value={inactiveDays}
                placeholder="30"
                className="w-32"
                onChange={(e) => {
                  setInactiveDays(e.target.value);
                  setPreview(null);
                }}
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={hasPurchased}
                onCheckedChange={(c) => {
                  setHasPurchased(Boolean(c));
                  setPreview(null);
                }}
              />
              <span className="text-sm">Solo clientes que ya compraron</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={birthdayThisMonth}
                onCheckedChange={(c) => {
                  setBirthdayThisMonth(Boolean(c));
                  setPreview(null);
                }}
              />
              <span className="text-sm">Cumplen años este mes</span>
            </label>

            <div className="rounded-lg border border-border/60 p-3">
              {preview ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Users className="h-4 w-4 text-primary" aria-hidden />
                    {preview.audienceSize.toLocaleString("es-AR")} contactos en el
                    segmento
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Cupo mensual restante: {preview.remaining.toLocaleString("es-AR")}
                  </p>
                  {preview.exceedsQuota && (
                    <p className="text-xs text-amber-500 flex items-center gap-1">
                      <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                      La audiencia supera tu cupo. Segmentá más antes de lanzar.
                    </p>
                  )}
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={runPreview}
                  disabled={previewing}
                >
                  {previewing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Calculando…
                    </>
                  ) : (
                    "Calcular audiencia"
                  )}
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Nombre de la campaña</Label>
              <Input
                id="name"
                value={name}
                placeholder="Promo día de la madre"
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="template">Template aprobado</Label>
              {templates.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No tenés templates aprobados. Creá y aprobá uno en Configuración →
                  Templates antes de lanzar una campaña.
                </p>
              ) : (
                <select
                  id="template"
                  value={templateName}
                  onChange={(e) => {
                    setTemplateName(e.target.value);
                    const t = templates.find((x) => x.name === e.target.value);
                    if (t) setTemplateLanguage(t.language);
                  }}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                >
                  <option value="">Elegí un template…</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.name}>
                      {t.name} ({t.language})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {preview && (
              <p className="text-xs text-muted-foreground">
                Le va a llegar a{" "}
                <strong>{preview.audienceSize.toLocaleString("es-AR")}</strong>{" "}
                contactos. Las respuestas caen al inbox y las atiende la IA.
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          {step === 1 ? (
            <>
              <Button variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button onClick={() => setStep(2)} disabled={!preview}>
                Siguiente
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep(1)}>
                Atrás
              </Button>
              <Button
                variant="outline"
                onClick={() => handleCreate(false)}
                disabled={creating}
              >
                Guardar borrador
              </Button>
              <Button
                onClick={() => handleCreate(true)}
                disabled={creating || preview?.exceedsQuota}
              >
                {creating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creando…
                  </>
                ) : (
                  "Crear y lanzar"
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
