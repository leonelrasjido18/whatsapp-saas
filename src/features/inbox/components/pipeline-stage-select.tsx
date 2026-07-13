"use client";

// Manual override of a conversation's sales-pipeline stage, shown in the CRM
// panel. Self-contained: fetches its own state and renders nothing when the
// workspace pipeline is disabled.

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AgentType } from "@/features/agents/types";
import {
  PIPELINE_STAGE_ORDER,
  PIPELINE_STAGE_LABEL,
} from "@/features/agents/lib/pipeline-stage-ui";

export function PipelineStageSelect({
  conversationId,
}: {
  conversationId: string;
}) {
  const [enabled, setEnabled] = useState(false);
  const [stage, setStage] = useState<AgentType>("setter");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/conversations/${conversationId}/stage`)
      .then((r) => r.json())
      .then((d: { enabled?: boolean; stage?: AgentType }) => {
        if (!alive) return;
        setEnabled(Boolean(d.enabled));
        if (d.stage) setStage(d.stage);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, [conversationId]);

  async function changeStage(next: AgentType) {
    const prev = stage;
    setStage(next); // optimistic
    setSaving(true);
    try {
      const res = await fetch(`/api/conversations/${conversationId}/stage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: next }),
      });
      if (!res.ok) {
        setStage(prev);
        const j = (await res.json()) as { error?: string };
        toast.error(j.error ?? "No se pudo cambiar la etapa");
        return;
      }
      toast.success(`Etapa: ${PIPELINE_STAGE_LABEL[next]}`);
    } catch {
      setStage(prev);
      toast.error("Error de conexión");
    } finally {
      setSaving(false);
    }
  }

  // Hidden until we know the pipeline is on for this workspace.
  if (!loaded || !enabled) return null;

  return (
    <div className="space-y-1">
      <Label className="text-[10px] text-[hsl(var(--electric-lime))] uppercase tracking-wider">
        Etapa de venta
      </Label>
      <Select
        value={stage}
        onValueChange={(v) => changeStage(v as AgentType)}
        disabled={saving}
      >
        <SelectTrigger className="h-7 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PIPELINE_STAGE_ORDER.map((s) => (
            <SelectItem key={s} value={s} className="text-xs">
              {PIPELINE_STAGE_LABEL[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
