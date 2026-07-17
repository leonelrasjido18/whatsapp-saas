"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Sparkles, Loader2, Check, X, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Suggestion {
  id: string;
  issue: string;
  evidence: string | null;
  suggested_addition: string;
  based_on_count: number;
  status: "pending" | "applied" | "dismissed";
  created_at: string;
}

export function PromptImprovementTab({ workspaceId }: { workspaceId: string }) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/workspace/${workspaceId}/prompt-suggestions`);
      const json = (await res.json()) as { data?: Suggestion[] };
      setSuggestions(json.data ?? []);
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

  async function analyze() {
    setAnalyzing(true);
    try {
      const res = await fetch(`/api/workspace/${workspaceId}/prompt-suggestions`, {
        method: "POST",
      });
      const json = (await res.json()) as { data?: Suggestion[]; error?: string };
      if (!res.ok) throw new Error(json.error || "Error");
      setSuggestions(json.data ?? []);
      if (!json.data || json.data.length === 0) {
        toast.success("No encontré fricciones importantes. ¡Buen trabajo!");
      } else {
        toast.success(`${json.data.length} sugerencia(s) nueva(s)`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al analizar");
    } finally {
      setAnalyzing(false);
    }
  }

  async function resolve(id: string, action: "apply" | "dismiss") {
    setBusyId(id);
    try {
      const res = await fetch(
        `/api/workspace/${workspaceId}/prompt-suggestions/${id}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        },
      );
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || "Error");
      setSuggestions((prev) => prev.filter((s) => s.id !== id));
      toast.success(action === "apply" ? "Aplicado al agente" : "Descartado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setBusyId(null);
    }
  }

  const pending = suggestions.filter((s) => s.status === "pending");

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-sm font-medium text-foreground flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden />
            Auto-mejora del agente
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Analizo leads perdidos, clientes enojados y correcciones tuyas, y te
            propongo reglas concretas para que el agente no repita el error. Vos
            decidís qué aplicar.
          </p>
        </div>
        <Button size="sm" onClick={analyze} disabled={analyzing}>
          {analyzing ? (
            <>
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" aria-hidden />
              Analizando…
            </>
          ) : (
            "Analizar"
          )}
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : pending.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Sin sugerencias pendientes. Tocá “Analizar” para revisar el último mes.
        </p>
      ) : (
        <ul className="space-y-3">
          {pending.map((s) => (
            <li
              key={s.id}
              className="rounded-lg border border-border/60 bg-card p-4 space-y-2"
            >
              <p className="flex items-start gap-1.5 text-sm font-medium text-foreground">
                <Lightbulb className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" aria-hidden />
                {s.issue}
              </p>
              <p className="text-xs text-muted-foreground pl-5">
                Basado en {s.based_on_count} señal(es).
              </p>
              <div className="ml-5 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-foreground">
                “{s.suggested_addition}”
              </div>
              <div className="flex items-center gap-2 pl-5 pt-1">
                <Button
                  size="sm"
                  onClick={() => resolve(s.id, "apply")}
                  disabled={busyId === s.id}
                >
                  <Check className="h-3.5 w-3.5 mr-1.5" aria-hidden />
                  Aplicar al agente
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => resolve(s.id, "dismiss")}
                  disabled={busyId === s.id}
                >
                  <X className="h-3.5 w-3.5 mr-1.5" aria-hidden />
                  Descartar
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
