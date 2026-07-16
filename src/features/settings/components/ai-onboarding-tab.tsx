"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  Sparkles,
  Upload,
  Globe,
  Check,
  Package,
  HelpCircle,
  Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface ProposedProduct {
  name: string;
  description: string | null;
  price: number | null;
  type: "product" | "service";
}
interface ProposedFaq {
  question: string;
  answer: string;
}
interface Proposal {
  business: {
    name: string | null;
    description: string | null;
    address: string | null;
    hours: string | null;
    phone: string | null;
    email: string | null;
    website: string | null;
  };
  products: ProposedProduct[];
  faqs: ProposedFaq[];
  rawText: string;
}

export function AiOnboardingTab({ workspaceId }: { workspaceId: string }) {
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [applyBusiness, setApplyBusiness] = useState(true);
  const [applyProducts, setApplyProducts] = useState(true);
  const [applyFaqs, setApplyFaqs] = useState(true);
  const [excludedProducts, setExcludedProducts] = useState<Set<number>>(
    new Set(),
  );

  async function handleAnalyze() {
    if (!url.trim() && !file) {
      toast.error("Pegá una URL o subí un archivo.");
      return;
    }
    setAnalyzing(true);
    setProposal(null);
    try {
      const form = new FormData();
      if (url.trim()) form.append("url", url.trim());
      if (file) form.append("file", file);
      const res = await fetch(
        `/api/workspace/${workspaceId}/onboarding-ai/extract`,
        { method: "POST", body: form },
      );
      const json = (await res.json()) as { data?: Proposal; error?: string };
      if (!res.ok || !json.data) {
        throw new Error(json.error || "No se pudo analizar");
      }
      setProposal(json.data);
      setExcludedProducts(new Set());
      toast.success("Listo — revisá lo que encontré y aplicá.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al analizar");
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleApply() {
    if (!proposal) return;
    setApplying(true);
    try {
      const filtered: Proposal = {
        ...proposal,
        products: proposal.products.filter((_, i) => !excludedProducts.has(i)),
      };
      const res = await fetch(
        `/api/workspace/${workspaceId}/onboarding-ai/apply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            proposal: filtered,
            options: { applyBusiness, applyProducts, applyFaqs },
          }),
        },
      );
      const json = (await res.json()) as {
        data?: { productsCreated: number; faqsIngested: number };
        error?: string;
      };
      if (!res.ok || !json.data) throw new Error(json.error || "Error al aplicar");
      toast.success(
        `Cargado: ${json.data.productsCreated} productos, ${json.data.faqsIngested} FAQs.`,
      );
      setProposal(null);
      setUrl("");
      setFile(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al aplicar");
    } finally {
      setApplying(false);
    }
  }

  function toggleProduct(i: number) {
    setExcludedProducts((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  const b = proposal?.business;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-display text-sm font-medium text-foreground flex items-center gap-1.5">
          <Sparkles className="h-4 w-4 text-primary" aria-hidden />
          Autocarga con IA
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Pegá el sitio web del negocio o subí un menú/catálogo (PDF, Word,
          Excel). La IA arma la info del negocio, el catálogo y las preguntas
          frecuentes. Después revisás y cargás con un clic.
        </p>
      </div>

      {/* Sources */}
      <div className="space-y-3 rounded-lg border border-border/60 p-4">
        <div className="space-y-1.5">
          <Label htmlFor="ai-url" className="flex items-center gap-1.5">
            <Globe className="h-3.5 w-3.5" aria-hidden /> Sitio web
          </Label>
          <Input
            id="ai-url"
            type="url"
            value={url}
            placeholder="https://minegocio.com"
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5">
            <Upload className="h-3.5 w-3.5" aria-hidden /> o archivo (PDF/Word/Excel)
          </Label>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.csv"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              Elegir archivo
            </Button>
            <span className="text-xs text-muted-foreground truncate">
              {file ? file.name : "Ningún archivo"}
            </span>
          </div>
        </div>

        <Button onClick={handleAnalyze} disabled={analyzing} aria-busy={analyzing}>
          {analyzing ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden />
              Analizando…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" aria-hidden />
              Analizar
            </>
          )}
        </Button>
      </div>

      {/* Review */}
      {proposal && (
        <div className="space-y-4">
          {/* Business */}
          <div className="rounded-lg border border-border/60 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <Building2 className="h-4 w-4 text-primary" aria-hidden />
                Info del negocio
              </span>
              <Switch checked={applyBusiness} onCheckedChange={setApplyBusiness} />
            </div>
            {b && (
              <dl className="text-xs text-muted-foreground space-y-0.5">
                {b.name && <div><span className="font-medium text-foreground">{b.name}</span></div>}
                {b.description && <div>{b.description}</div>}
                {b.address && <div>📍 {b.address}</div>}
                {b.hours && <div>🕒 {b.hours}</div>}
                {b.phone && <div>📞 {b.phone}</div>}
                {b.email && <div>✉️ {b.email}</div>}
              </dl>
            )}
          </div>

          {/* Products */}
          <div className="rounded-lg border border-border/60 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <Package className="h-4 w-4 text-primary" aria-hidden />
                Catálogo ({proposal.products.length - excludedProducts.size})
              </span>
              <Switch checked={applyProducts} onCheckedChange={setApplyProducts} />
            </div>
            {proposal.products.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No se detectaron productos.
              </p>
            ) : (
              <ul className="divide-y divide-border/50 max-h-64 overflow-y-auto">
                {proposal.products.map((p, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-2 py-1.5 text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={!excludedProducts.has(i)}
                      onChange={() => toggleProduct(i)}
                      className="h-3.5 w-3.5"
                      aria-label={`Incluir ${p.name}`}
                    />
                    <span className="flex-1 truncate">{p.name}</span>
                    <span className="text-muted-foreground">
                      {p.price != null
                        ? "$" + p.price.toLocaleString("es-AR")
                        : "s/precio"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* FAQs */}
          <div className="rounded-lg border border-border/60 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <HelpCircle className="h-4 w-4 text-primary" aria-hidden />
                Preguntas frecuentes ({proposal.faqs.length})
              </span>
              <Switch checked={applyFaqs} onCheckedChange={setApplyFaqs} />
            </div>
            {proposal.faqs.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin FAQs.</p>
            ) : (
              <ul className="space-y-1.5 max-h-48 overflow-y-auto">
                {proposal.faqs.map((f, i) => (
                  <li key={i} className="text-xs">
                    <p className="font-medium">{f.question}</p>
                    <p className="text-muted-foreground">{f.answer}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Button onClick={handleApply} disabled={applying} aria-busy={applying}>
            {applying ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden />
                Cargando…
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-2" aria-hidden />
                Cargar todo lo seleccionado
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
