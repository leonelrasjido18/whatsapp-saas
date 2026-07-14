"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Megaphone, Plus, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Campaign } from "@/features/campaigns/types";
import CampaignCard from "./campaign-card";
import CampaignWizard from "./campaign-wizard";

interface Props {
  workspaceId: string;
  role: string;
  campaignsEnabled: boolean;
  monthlyLimit: number;
}

export default function CampaignsShell({
  workspaceId,
  role,
  campaignsEnabled,
  monthlyLimit,
}: Props) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);

  const canManage = ["admin", "manager"].includes(role);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/workspace/${workspaceId}/campaigns`);
      const json = (await res.json()) as { data?: Campaign[] };
      setCampaigns(json.data ?? []);
    } catch {
      toast.error("No se pudieron cargar las campañas");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (campaignsEnabled) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- load resets loading before fetch
      load();
    } else {
      setLoading(false);
    }
  }, [load, campaignsEnabled]);

  if (!campaignsEnabled) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <div className="inline-flex rounded-full bg-muted p-4">
          <Lock className="h-8 w-8 text-muted-foreground" aria-hidden />
        </div>
        <h1 className="font-display text-xl font-semibold mt-4">
          Campañas de WhatsApp
        </h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
          Enviá promociones y novedades a tus clientes segmentados, y dejá que la
          IA atienda las respuestas. Disponible en el plan Pro y superiores.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-xl font-semibold text-foreground">
            Campañas
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Difusión masiva segmentada · {monthlyLimit.toLocaleString("es-AR")}{" "}
            destinatarios/mes en tu plan
          </p>
        </div>
        {canManage && (
          <Button onClick={() => setWizardOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nueva campaña
          </Button>
        )}
      </div>

      {loading ? (
        <p className="text-center py-16 text-muted-foreground text-sm">
          Cargando…
        </p>
      ) : campaigns.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border/60 py-16 text-center">
          <Megaphone className="h-9 w-9 text-muted-foreground/50" aria-hidden />
          <div>
            <p className="text-sm font-medium text-foreground">
              Todavía no creaste campañas
            </p>
            <p className="mt-1 text-xs text-muted-foreground max-w-xs">
              Creá tu primera campaña para llegar a tus clientes con una promo o
              novedad.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => (
            <CampaignCard
              key={c.id}
              campaign={c}
              workspaceId={workspaceId}
              canManage={canManage}
              onChange={load}
            />
          ))}
        </div>
      )}

      {wizardOpen && (
        <CampaignWizard
          workspaceId={workspaceId}
          onClose={() => setWizardOpen(false)}
          onCreated={() => {
            setWizardOpen(false);
            load();
          }}
        />
      )}
    </div>
  );
}
