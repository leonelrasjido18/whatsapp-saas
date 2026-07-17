"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Plus,
  Wifi,
  WifiOff,
  ExternalLink,
  Settings,
  Trash2,
  CreditCard,
  Repeat,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CreateWorkspaceSheet } from "./create-workspace-sheet";
import { switchWorkspace } from "@/features/workspace/services/actions";
import {
  deleteWorkspaceForClient,
  updateWorkspaceBusinessType,
  applyWorkspaceTemplate,
  createBillingLink,
} from "../services/agency-actions";
import { INDUSTRY_TEMPLATES } from "../services/industry-templates";
import { BUSINESS_TYPES, type BusinessType } from "@/features/workspace/lib/business-type";
import { cn } from "@/lib/utils";
import type { WorkspaceWithStats } from "../types";

interface Props {
  workspaces: WorkspaceWithStats[];
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "America/Mexico_City",
  }).format(new Date(iso));
}

export function WorkspacesTable({ workspaces }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();

  const filtered = workspaces.filter(
    (w) =>
      w.name.toLowerCase().includes(search.toLowerCase()) ||
      w.slug.toLowerCase().includes(search.toLowerCase()),
  );

  function handleCreated() {
    startRefresh(() => {
      router.refresh();
    });
  }

  // Set the active-workspace context, then navigate into the app for it.
  // The action only sets the cookie (no redirectTo); we navigate client-side —
  // mirroring WorkspaceSwitcher. A redirect() inside startTransition does not
  // navigate reliably on Next 16 / React 19, which left this button mute.
  function handleEnter(workspaceId: string, to: string) {
    startRefresh(async () => {
      const result = await switchWorkspace(workspaceId);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      router.push(to);
    });
  }

  function handleTypeChange(workspaceId: string, type: BusinessType) {
    startRefresh(async () => {
      const result = await updateWorkspaceBusinessType(workspaceId, type);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Tipo de negocio actualizado");
      router.refresh();
    });
  }

  function handleApplyTemplate(
    workspaceId: string,
    name: string,
    templateKey: string,
  ) {
    if (!templateKey) return;
    if (
      !confirm(
        `Aplicar esta plantilla a "${name}"? Va a cargar prompt, catálogo demo, FAQs y activar las tools del rubro.`,
      )
    ) {
      return;
    }
    startRefresh(async () => {
      const result = await applyWorkspaceTemplate(workspaceId, templateKey);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `Plantilla aplicada (${result.productsCreated ?? 0} productos demo).`,
      );
      router.refresh();
    });
  }

  // Cobro recurrente: genera un link de suscripción de MercadoPago para el cliente.
  function handleBilling(workspaceId: string, name: string) {
    const amountStr = prompt(
      `Cobro mensual automático para "${name}" (ARS). Ej: 10000`,
    );
    if (!amountStr) return;
    const amount = Number(amountStr);
    if (!(amount > 0)) {
      toast.error("Monto inválido");
      return;
    }
    const email = prompt("Email del cliente (pagador en MercadoPago):");
    if (!email) return;
    startRefresh(async () => {
      const res = await createBillingLink(workspaceId, amount, email);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      if (res.initPoint) {
        toast.success("Link de suscripción creado. Se abrió para copiarlo.");
        window.open(res.initPoint, "_blank");
      }
    });
  }

  // Permanently delete a client (cascade). Two-step confirm via `confirmId`.
  function handleDelete(workspaceId: string) {
    setConfirmId(null);
    startRefresh(async () => {
      const result = await deleteWorkspaceForClient(workspaceId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Cliente eliminado");
      router.refresh();
    });
  }

  return (
    <>
      {/* Toolbar */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <Input
          placeholder="Buscar workspace..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
          aria-label="Buscar workspace por nombre o slug"
        />
        <Button
          size="sm"
          onClick={() => setSheetOpen(true)}
          className="shrink-0"
        >
          <Plus className="h-4 w-4 mr-1.5" aria-hidden="true" />
          Nuevo cliente
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden">
        {/* Header row */}
        <div
          className={cn(
            "hidden md:grid gap-4 px-4 py-2.5",
            "border-b border-border bg-muted/40",
            "grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_auto]",
          )}
        >
          {[
            "Workspace",
            "Miembros",
            "Plan",
            "Suscripción",
            "YCloud",
            "Creado",
            "",
          ].map((h) => (
            <p
              key={h}
              className="font-mono text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              {h}
            </p>
          ))}
        </div>

        {/* Empty state */}
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
            <Building2 className="h-8 w-8 opacity-40" strokeWidth={1.5} />
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">
                {search ? "Sin resultados" : "Sin workspaces aún"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {search
                  ? "Prueba con otro término de búsqueda"
                  : "Da de alta tu primer cliente"}
              </p>
            </div>
            {!search && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSheetOpen(true)}
              >
                <Plus className="h-4 w-4 mr-1.5" aria-hidden="true" />
                Dar de alta cliente
              </Button>
            )}
          </div>
        )}

        {/* Rows */}
        {filtered.map((workspace) => (
          <div
            key={workspace.id}
            className={cn(
              "flex flex-col gap-3 px-4 py-4",
              "md:grid md:grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_auto] md:items-center md:gap-4 md:py-3",
              "border-b border-border last:border-0",
              "hover:bg-muted/20 transition-colors duration-150",
            )}
          >
            {/* Workspace name + slug + business type */}
            <div className="min-w-0">
              <p className="font-display text-sm font-semibold text-foreground truncate">
                {workspace.name}
              </p>
              <p className="font-mono text-xs text-muted-foreground mt-0.5">
                {workspace.slug}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <select
                  value={workspace.business_type}
                  onChange={(e) =>
                    handleTypeChange(workspace.id, e.target.value as BusinessType)
                  }
                  disabled={refreshing}
                  aria-label={`Tipo de negocio de ${workspace.name}`}
                  className="h-7 rounded-md border border-input bg-background px-2 text-xs text-foreground"
                  onClick={(e) => e.stopPropagation()}
                >
                  {BUSINESS_TYPES.map((bt) => (
                    <option key={bt.value} value={bt.value}>
                      {bt.label}
                    </option>
                  ))}
                </select>
                <select
                  value=""
                  onChange={(e) =>
                    handleApplyTemplate(
                      workspace.id,
                      workspace.name,
                      e.target.value,
                    )
                  }
                  disabled={refreshing}
                  aria-label={`Aplicar plantilla de rubro a ${workspace.name}`}
                  className="h-7 rounded-md border border-input bg-background px-2 text-xs text-muted-foreground"
                  onClick={(e) => e.stopPropagation()}
                >
                  <option value="">+ Plantilla de rubro…</option>
                  {INDUSTRY_TEMPLATES.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Miembros */}
            <div className="flex items-center gap-2 md:block">
              <span className="text-xs text-muted-foreground md:hidden">
                Miembros:
              </span>
              <p className="font-mono text-sm font-bold text-foreground">
                {workspace.member_count}
              </p>
            </div>

            {/* Plan */}
            <div className="flex items-center gap-2 md:block">
              <span className="text-xs text-muted-foreground md:hidden">
                Plan:
              </span>
              <Badge variant="outline" className="w-fit capitalize">
                {workspace.plan_tier}
              </Badge>
            </div>

            {/* Suscripción */}
            <div className="flex items-center gap-2 md:block">
              <span className="text-xs text-muted-foreground md:hidden">
                Suscripción:
              </span>
              <Badge
                variant="outline"
                className={cn(
                  "w-fit capitalize",
                  workspace.subscription_status === "active"
                    ? "border-success/30 bg-success/10 text-success"
                    : workspace.subscription_status === "suspended"
                      ? "border-destructive/30 bg-destructive/10 text-destructive"
                      : workspace.subscription_status === "past_due"
                        ? "border-amber-500/30 bg-amber-500/10 text-amber-600"
                        : "border-border text-muted-foreground"
                )}
              >
                {workspace.subscription_status}
              </Badge>
            </div>

            {/* YCloud badge */}
            <div className="flex items-center gap-2 md:block">
              <span className="text-xs text-muted-foreground md:hidden">
                YCloud:
              </span>
              {workspace.ycloud_connected ? (
                <Badge
                  variant="outline"
                  className="border-success/30 bg-success/10 text-success gap-1 w-fit"
                >
                  <Wifi className="h-3 w-3" aria-hidden="true" />
                  Conectado
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="border-border text-muted-foreground gap-1 w-fit"
                >
                  <WifiOff className="h-3 w-3" aria-hidden="true" />
                  No conectado
                </Badge>
              )}
            </div>

            {/* Fecha */}
            <div className="flex items-center gap-2 md:block">
              <span className="text-xs text-muted-foreground md:hidden">
                Creado:
              </span>
              <p className="font-mono text-xs text-muted-foreground">
                {formatDate(workspace.created_at)}
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="ghost"
                className="h-8 px-2.5 text-muted-foreground hover:text-foreground"
                aria-label={`Ir al inbox de ${workspace.name}`}
                onClick={() => handleEnter(workspace.id, "/inbox")}
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="sr-only sm:not-sr-only sm:ml-1.5 text-xs">
                  Inbox
                </span>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 px-2.5 text-muted-foreground hover:text-foreground"
                aria-label={`Gestionar ${workspace.name}`}
                onClick={() => handleEnter(workspace.id, "/settings")}
              >
                <Settings className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="sr-only sm:not-sr-only sm:ml-1.5 text-xs">
                  Gestionar
                </span>
              </Button>

              <Button
                size="sm"
                variant="ghost"
                className="h-8 px-2.5 text-muted-foreground hover:text-foreground"
                aria-label={`Billing de ${workspace.name}`}
                onClick={() => handleEnter(workspace.id, `/workspaces/${workspace.id}/billing`)}
              >
                <CreditCard className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="sr-only sm:not-sr-only sm:ml-1.5 text-xs">
                  Billing
                </span>
              </Button>

              <Button
                size="sm"
                variant="ghost"
                className="h-8 px-2.5 text-muted-foreground hover:text-foreground"
                aria-label={`Cobro recurrente de ${workspace.name}`}
                onClick={() => handleBilling(workspace.id, workspace.name)}
              >
                <Repeat className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="sr-only sm:not-sr-only sm:ml-1.5 text-xs">
                  Cobro
                </span>
              </Button>

              {confirmId === workspace.id ? (
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-8 px-2.5 text-xs"
                    aria-label={`Confirmar eliminación de ${workspace.name}`}
                    onClick={() => handleDelete(workspace.id)}
                  >
                    Eliminar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2.5 text-xs text-muted-foreground"
                    onClick={() => setConfirmId(null)}
                  >
                    Cancelar
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 px-2.5 text-muted-foreground hover:text-destructive"
                  aria-label={`Eliminar ${workspace.name}`}
                  onClick={() => setConfirmId(workspace.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Refreshing overlay indicator */}
      {refreshing && (
        <div className="mt-3 space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      )}

      <CreateWorkspaceSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onCreated={handleCreated}
      />
    </>
  );
}
