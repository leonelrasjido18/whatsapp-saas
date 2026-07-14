import { TrendingUp, TrendingDown, Bot, ShoppingCart, RotateCcw, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RoiReport } from "@/features/dashboard/services/roi-report";

function formatArs(n: number): string {
  return "$" + Math.round(n).toLocaleString("es-AR");
}

/** Percentage change current-vs-previous; null when previous is 0 (no baseline). */
function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

function DeltaBadge({ current, previous }: { current: number; previous: number }) {
  const pct = pctChange(current, previous);
  if (pct === null || pct === 0) return null;
  const up = pct > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium",
        up ? "text-emerald-500" : "text-red-500",
      )}
    >
      {up ? (
        <TrendingUp className="h-3 w-3" aria-hidden />
      ) : (
        <TrendingDown className="h-3 w-3" aria-hidden />
      )}
      {Math.abs(pct)}%
    </span>
  );
}

interface RoiCardProps {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  current: number;
  previous: number;
}

function RoiCard({ label, value, sub, icon, current, previous }: RoiCardProps) {
  return (
    <div className="rounded-xl border border-border/50 bg-card p-5">
      <div className="flex items-center justify-between">
        <div className="rounded-lg bg-primary/10 text-primary p-2">{icon}</div>
        <DeltaBadge current={current} previous={previous} />
      </div>
      <p className="font-display text-2xl font-semibold text-foreground mt-3 tabular-nums">
        {value}
      </p>
      <p className="text-xs text-muted-foreground font-medium mt-0.5">{label}</p>
      {sub && <p className="text-xs text-muted-foreground/70 mt-1">{sub}</p>}
    </div>
  );
}

interface Props {
  current: RoiReport;
  previous: RoiReport;
}

export function RoiSection({ current, previous }: Props) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-base font-semibold text-foreground">
          Lo que hizo tu IA — últimos 7 días
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Comparado con los 7 días anteriores
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <RoiCard
          label="Ventas cerradas por la IA"
          value={current.aiSalesCount.toLocaleString("es-AR")}
          sub={formatArs(current.aiSalesRevenue)}
          icon={<Bot className="h-4 w-4" aria-hidden />}
          current={current.aiSalesRevenue}
          previous={previous.aiSalesRevenue}
        />
        <RoiCard
          label="Facturado en total"
          value={formatArs(current.totalSalesRevenue)}
          sub={`${current.totalSalesCount} ventas`}
          icon={<ShoppingCart className="h-4 w-4" aria-hidden />}
          current={current.totalSalesRevenue}
          previous={previous.totalSalesRevenue}
        />
        <RoiCard
          label="Carritos recuperados"
          value={current.recoveredCartsCount.toLocaleString("es-AR")}
          sub={formatArs(current.recoveredCartsRevenue)}
          icon={<RotateCcw className="h-4 w-4" aria-hidden />}
          current={current.recoveredCartsRevenue}
          previous={previous.recoveredCartsRevenue}
        />
        <RoiCard
          label="Clientes nuevos"
          value={current.newContacts.toLocaleString("es-AR")}
          sub={`${current.conversationsHandled} conversaciones`}
          icon={<UserPlus className="h-4 w-4" aria-hidden />}
          current={current.newContacts}
          previous={previous.newContacts}
        />
      </div>
    </div>
  );
}
