"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ThumbsUp, ThumbsDown, Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";

type Rating = "up" | "down";

/**
 * 👍/👎 controls shown on the AI's replies. A 👎 opens a small box to write the
 * correct answer, which the backend turns into a Knowledge Base entry so the
 * agent learns. Reuses the message id + workspace id from the row.
 */
export function MessageFeedback({
  workspaceId,
  messageId,
}: {
  workspaceId: string;
  messageId: string;
}) {
  const [rating, setRating] = useState<Rating | null>(null);
  const [showCorrection, setShowCorrection] = useState(false);
  const [correction, setCorrection] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function send(r: Rating, correctionText?: string) {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/workspace/${workspaceId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageId,
          rating: r,
          correction: correctionText ?? null,
        }),
      });
      const json = (await res.json()) as { learned?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error || "Error");
      setRating(r);
      if (json.learned) {
        setDone(true);
        toast.success("¡Aprendido! Lo guardé en la base de conocimiento.");
      } else if (r === "up") {
        toast.success("Gracias por el feedback");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al enviar");
    } finally {
      setSubmitting(false);
    }
  }

  function handleThumbUp() {
    setShowCorrection(false);
    void send("up");
  }

  function handleThumbDown() {
    setRating("down");
    setShowCorrection(true);
  }

  async function submitCorrection() {
    await send("down", correction.trim() || undefined);
    setShowCorrection(false);
  }

  if (done) {
    return (
      <div className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400">
        <Check className="h-3 w-3" aria-hidden="true" />
        Corrección guardada
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={handleThumbUp}
          disabled={submitting}
          aria-label="La respuesta fue buena"
          className={cn(
            "p-1 rounded transition-colors hover:text-emerald-600",
            rating === "up" ? "text-emerald-600" : "text-muted-foreground/60",
          )}
        >
          <ThumbsUp className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={handleThumbDown}
          disabled={submitting}
          aria-label="La respuesta fue mala — enseñar la correcta"
          className={cn(
            "p-1 rounded transition-colors hover:text-destructive",
            rating === "down" ? "text-destructive" : "text-muted-foreground/60",
          )}
        >
          <ThumbsDown className="h-3 w-3" />
        </button>
        {submitting && (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        )}
      </div>

      {showCorrection && (
        <div className="space-y-1.5 rounded-md border border-border/60 bg-background/60 p-2">
          <p className="text-[10px] text-muted-foreground">
            ¿Qué debería haber respondido? Lo guardo para que aprenda.
          </p>
          <textarea
            value={correction}
            onChange={(e) => setCorrection(e.target.value)}
            rows={2}
            placeholder="Escribí la respuesta correcta…"
            className="w-full rounded border border-input bg-background px-2 py-1 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={submitCorrection}
              disabled={submitting || correction.trim().length === 0}
              className="rounded bg-primary px-2 py-1 text-[10px] font-medium text-primary-foreground disabled:opacity-50"
            >
              Enseñar
            </button>
            <button
              type="button"
              onClick={() => setShowCorrection(false)}
              className="text-[10px] text-muted-foreground hover:text-foreground"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
