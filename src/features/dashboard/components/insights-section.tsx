"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Sparkles, Loader2, MessageSquareQuote, TrendingDown, PackageSearch, Smile } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Insights {
  topQuestions: string[];
  objections: string[];
  missingProducts: string[];
  sentiment: string;
  summary: string;
}

export function InsightsSection({ workspaceId }: { workspaceId: string }) {
  const [insights, setInsights] = useState<Insights | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/workspace/${workspaceId}/insights`);
      const json = (await res.json()) as {
        data?: { data: Insights; generatedAt: string } | null;
      };
      if (json.data) {
        setInsights(json.data.data);
        setGeneratedAt(json.data.generatedAt);
      }
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

  async function generate() {
    setGenerating(true);
    try {
      const res = await fetch(`/api/workspace/${workspaceId}/insights`, {
        method: "POST",
      });
      const json = (await res.json()) as {
        data?: { data: Insights; generatedAt: string };
        error?: string;
      };
      if (!res.ok || !json.data) throw new Error(json.error || "Error");
      setInsights(json.data.data);
      setGeneratedAt(json.data.generatedAt);
      toast.success("Insights actualizados");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al generar");
    } finally {
      setGenerating(false);
    }
  }

  const Block = ({
    icon: Icon,
    title,
    items,
  }: {
    icon: typeof MessageSquareQuote;
    title: string;
    items: string[];
  }) =>
    items.length > 0 ? (
      <div className="space-y-1.5">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <Icon className="h-3.5 w-3.5 text-primary" aria-hidden />
          {title}
        </p>
        <ul className="space-y-1 pl-5 list-disc text-sm text-muted-foreground">
          {items.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ul>
      </div>
    ) : null;

  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-1.5 font-display text-lg font-semibold text-foreground">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden />
            Insights con IA
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Qué te preguntan, qué los frena y qué te piden que no tenés.
          </p>
        </div>
        <Button size="sm" onClick={generate} disabled={generating}>
          {generating ? (
            <>
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" aria-hidden />
              Analizando…
            </>
          ) : (
            "Actualizar"
          )}
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : !insights ? (
        <p className="text-sm text-muted-foreground">
          Todavía no generaste insights. Tocá “Actualizar” para analizar las
          últimas conversaciones.
        </p>
      ) : (
        <div className="space-y-4">
          {insights.summary && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-foreground">
              {insights.summary}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Block
              icon={MessageSquareQuote}
              title="Más preguntan"
              items={insights.topQuestions}
            />
            <Block
              icon={TrendingDown}
              title="Objeciones"
              items={insights.objections}
            />
            <Block
              icon={PackageSearch}
              title="Piden y quizás no tenés"
              items={insights.missingProducts}
            />
            {insights.sentiment && (
              <div className="space-y-1.5">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <Smile className="h-3.5 w-3.5 text-primary" aria-hidden />
                  Ánimo general
                </p>
                <p className="text-sm text-muted-foreground">
                  {insights.sentiment}
                </p>
              </div>
            )}
          </div>
          {generatedAt && (
            <p className="text-[10px] text-muted-foreground/70">
              Actualizado: {new Date(generatedAt).toLocaleString("es-AR")}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
