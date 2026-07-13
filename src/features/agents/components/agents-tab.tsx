"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AgentCard } from "./agent-card";
import { AgentConfigSheet } from "./agent-config-sheet";
import type { AgentDto, AgentType } from "@/features/agents/types";

const ORDER: AgentType[] = ["setter", "soporte", "agendamiento"];

function sortAgents(list: AgentDto[]): AgentDto[] {
  return [...list].sort(
    (a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type),
  );
}

export function AgentsTab({
  workspaceId,
  initialAgents,
}: {
  workspaceId: string;
  initialAgents: AgentDto[];
}) {
  const router = useRouter();
  const [agents, setAgents] = useState<AgentDto[]>(() =>
    sortAgents(initialAgents),
  );
  const [editing, setEditing] = useState<AgentDto | null>(null);
  const [pending, setPending] = useState<AgentDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [pipelineEnabled, setPipelineEnabled] = useState(false);
  const [pipelineBusy, setPipelineBusy] = useState(false);

  const currentActive = agents.find((a) => a.isActive) ?? null;

  useEffect(() => {
    fetch(`/api/workspace/${workspaceId}/pipeline`)
      .then((r) => r.json())
      .then((d: { enabled?: boolean }) => setPipelineEnabled(Boolean(d.enabled)))
      .catch(() => {});
  }, [workspaceId]);

  async function togglePipeline(next: boolean) {
    setPipelineBusy(true);
    setPipelineEnabled(next); // optimistic
    try {
      const res = await fetch(`/api/workspace/${workspaceId}/pipeline`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) {
        setPipelineEnabled(!next); // revert
        const j = (await res.json()) as { error?: string };
        toast.error(j.error ?? "No se pudo cambiar el pipeline");
        return;
      }
      toast.success(
        next
          ? "Pipeline de ventas activado: Calificador → Ventas → Posventa"
          : "Pipeline desactivado: vuelve a un único agente activo",
      );
    } catch {
      setPipelineEnabled(!next);
      toast.error("Error de conexión");
    } finally {
      setPipelineBusy(false);
    }
  }

  function requestActivate(agentId: string) {
    const target = agents.find((a) => a.id === agentId);
    if (!target || target.isActive) return;
    setPending(target);
  }

  async function confirmActivate() {
    if (!pending) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/workspace/${workspaceId}/agents`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: pending.id, setActive: true }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(json.error ?? "No se pudo activar el agente");
        return;
      }
      setAgents((prev) =>
        prev.map((a) => ({ ...a, isActive: a.id === pending.id })),
      );
      toast.success(`${pending.name} está activo`);
      router.refresh();
    } catch {
      toast.error("Error de conexión");
    } finally {
      setBusy(false);
      setPending(null);
    }
  }

  function handleSaved(updated: Partial<AgentDto> & { id: string }) {
    setAgents((prev) =>
      sortAgents(
        prev.map((a) => (a.id === updated.id ? { ...a, ...updated } : a)),
      ),
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
        <div className="space-y-0.5">
          <h3 className="font-display text-sm font-medium text-foreground">
            Pipeline de ventas
          </h3>
          <p className="text-sm text-muted-foreground">
            Activá el flujo de 3 etapas por conversación: el{" "}
            <strong>Calificador</strong> atiende, y cuando detecta intención de
            compra pasa a <strong>Ventas</strong>; al pagarse el pedido pasa solo
            a <strong>Posventa</strong>. Con esto apagado, responde un único
            agente activo.
          </p>
        </div>
        <Switch
          checked={pipelineEnabled}
          onCheckedChange={togglePipeline}
          disabled={pipelineBusy}
          aria-label="Activar pipeline de ventas"
        />
      </div>

      <p className="text-sm text-muted-foreground">
        {pipelineEnabled
          ? "Con el pipeline activo, cada agente atiende su etapa. Configurá los 3."
          : "Configura tus 3 agentes. Solo uno puede estar activo a la vez."}
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {agents.map((a) => (
          <AgentCard
            key={a.id}
            agent={a}
            busy={busy}
            onConfigure={setEditing}
            onActivate={requestActivate}
          />
        ))}
      </div>

      {editing && (
        <AgentConfigSheet
          key={editing.id}
          workspaceId={workspaceId}
          agent={editing}
          open={!!editing}
          onOpenChange={(o) => {
            if (!o) setEditing(null);
          }}
          onSaved={handleSaved}
        />
      )}

      <Dialog
        open={!!pending}
        onOpenChange={(o) => {
          if (!o) setPending(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Activar a {pending?.name}</DialogTitle>
            <DialogDescription>
              {currentActive && currentActive.id !== pending?.id
                ? `Esto desactivará a ${currentActive.name}. Solo un agente puede estar activo a la vez.`
                : "¿Activar este agente?"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPending(null)}>
              Cancelar
            </Button>
            <Button onClick={confirmActivate} disabled={busy} aria-busy={busy}>
              Activar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
