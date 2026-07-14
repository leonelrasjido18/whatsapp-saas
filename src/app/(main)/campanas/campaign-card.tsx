"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Play, Pause, Trash2, Loader2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Campaign, CampaignStatus } from "@/features/campaigns/types";

const STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: "Borrador",
  scheduled: "Programada",
  sending: "Enviando",
  paused: "Pausada",
  done: "Finalizada",
  failed: "Falló",
};

const STATUS_COLORS: Record<CampaignStatus, string> = {
  draft: "text-muted-foreground border-border",
  scheduled: "text-blue-400 border-blue-400/30",
  sending: "text-amber-400 border-amber-400/30",
  paused: "text-orange-400 border-orange-400/30",
  done: "text-emerald-400 border-emerald-400/30",
  failed: "text-red-400 border-red-400/30",
};

export default function CampaignCard({
  campaign,
  workspaceId,
  canManage,
  onChange,
}: {
  campaign: Campaign;
  workspaceId: string;
  canManage: boolean;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const s = campaign.stats;

  async function act(action: "launch" | "pause" | "resume") {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/workspace/${workspaceId}/campaigns/${campaign.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        },
      );
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Error");
      toast.success(
        action === "pause" ? "Campaña pausada" : "Campaña en envío",
      );
      onChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`¿Eliminar la campaña "${campaign.name}"?`)) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/workspace/${workspaceId}/campaigns/${campaign.id}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("Error al eliminar");
      toast.success("Campaña eliminada");
      onChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  const canLaunch = campaign.status === "draft" || campaign.status === "scheduled";
  const canPause = campaign.status === "sending";
  const canResume = campaign.status === "paused";

  return (
    <div className="rounded-lg border border-border/60 bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-foreground truncate">
              {campaign.name}
            </h3>
            <Badge
              variant="outline"
              className={`text-xs font-normal shrink-0 ${STATUS_COLORS[campaign.status]}`}
            >
              {STATUS_LABELS[campaign.status]}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Template: {campaign.template_name}
          </p>
        </div>

        {canManage && (
          <div className="flex items-center gap-1 shrink-0">
            {canLaunch && (
              <Button size="sm" onClick={() => act("launch")} disabled={busy}>
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                <span className="ml-1.5">Lanzar</span>
              </Button>
            )}
            {canPause && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => act("pause")}
                disabled={busy}
              >
                <Pause className="h-4 w-4" />
                <span className="ml-1.5">Pausar</span>
              </Button>
            )}
            {canResume && (
              <Button size="sm" onClick={() => act("resume")} disabled={busy}>
                <Play className="h-4 w-4" />
                <span className="ml-1.5">Reanudar</span>
              </Button>
            )}
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              aria-label="Eliminar campaña"
              className="p-2 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* Funnel */}
      <div className="grid grid-cols-4 gap-2 mt-4">
        <Stat label="Total" value={s.total} icon={<Users className="h-3.5 w-3.5" />} />
        <Stat label="Enviados" value={s.sent} />
        <Stat label="Entregados" value={s.delivered} />
        <Stat label="Leídos" value={s.read} />
      </div>
      {s.failed > 0 && (
        <p className="text-xs text-red-400 mt-2">{s.failed} fallidos</p>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-md bg-muted/30 p-2 text-center">
      <p className="font-display text-lg font-semibold tabular-nums text-foreground">
        {value.toLocaleString("es-AR")}
      </p>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center justify-center gap-1">
        {icon}
        {label}
      </p>
    </div>
  );
}
