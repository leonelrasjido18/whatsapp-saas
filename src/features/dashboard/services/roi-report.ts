// ROI report — quantifies what the AI agent produced for the business over a
// window: sales it closed, carts it recovered, conversations it handled. Powers
// both the dashboard ROI section and the weekly WhatsApp summary cron.
//
// AI attribution needs no new column: an order created by the agent has
// source='chat' AND created_by IS NULL (the orders schema documents
// "created_by NULL = IA"). A recovered cart is a previously-reminded pending
// order that later got paid (reminder_sent_at set, then status='paid').

import { createClient as createSbClient } from "@supabase/supabase-js";

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export interface RoiReport {
  from: string;
  to: string;
  aiSalesCount: number;
  aiSalesRevenue: number;
  totalSalesCount: number;
  totalSalesRevenue: number;
  recoveredCartsCount: number;
  recoveredCartsRevenue: number;
  conversationsHandled: number;
  resolvedWithoutHuman: number;
  newContacts: number;
}

function sumTotals(rows: { total: number | string | null }[]): number {
  return rows.reduce((sum, r) => sum + Number(r.total ?? 0), 0);
}

/**
 * Aggregates the agent's business impact between `from` and `to` (ISO strings).
 * Uses the service-role client — callers must have already authorized the
 * workspace (API route / cron secret).
 */
export async function computeRoiReport(
  workspaceId: string,
  from: string,
  to: string,
): Promise<RoiReport> {
  const supabase = svc();

  const [paidOrders, recoveredOrders, conversations, contactsResult] =
    await Promise.all([
      // Paid orders in range — with the columns we need to split AI vs. total.
      supabase
        .from("orders")
        .select("total, source, created_by")
        .eq("workspace_id", workspaceId)
        .eq("status", "paid")
        .gte("paid_at", from)
        .lte("paid_at", to),

      // Recovered carts: a reminder was sent AND the order ended up paid.
      supabase
        .from("orders")
        .select("total")
        .eq("workspace_id", workspaceId)
        .eq("status", "paid")
        .not("reminder_sent_at", "is", null)
        .gte("paid_at", from)
        .lte("paid_at", to),

      // Conversations touched in range, with state to gauge human involvement.
      supabase
        .from("conversations")
        .select("state")
        .eq("workspace_id", workspaceId)
        .gte("last_message_at", from)
        .lte("last_message_at", to),

      // New contacts acquired in range.
      supabase
        .from("contacts")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .gte("created_at", from)
        .lte("created_at", to),
    ]);

  const orders = paidOrders.data ?? [];
  const aiOrders = orders.filter(
    (o) => o.source === "chat" && o.created_by === null,
  );
  const recovered = recoveredOrders.data ?? [];
  const convs = conversations.data ?? [];

  // A conversation that never went to a human agent counts as AI-resolved.
  const resolvedWithoutHuman = convs.filter(
    (c) => c.state !== "human_active" && c.state !== "handoff_pending",
  ).length;

  return {
    from,
    to,
    aiSalesCount: aiOrders.length,
    aiSalesRevenue: sumTotals(aiOrders),
    totalSalesCount: orders.length,
    totalSalesRevenue: sumTotals(orders),
    recoveredCartsCount: recovered.length,
    recoveredCartsRevenue: sumTotals(recovered),
    conversationsHandled: convs.length,
    resolvedWithoutHuman,
    newContacts: contactsResult.count ?? 0,
  };
}

/** Returns ISO strings for the N-day window ending now, plus the prior window. */
export function lastNDaysWindows(days: number): {
  current: { from: string; to: string };
  previous: { from: string; to: string };
} {
  const now = Date.now();
  const span = days * 24 * 3600 * 1000;
  return {
    current: {
      from: new Date(now - span).toISOString(),
      to: new Date(now).toISOString(),
    },
    previous: {
      from: new Date(now - 2 * span).toISOString(),
      to: new Date(now - span).toISOString(),
    },
  };
}

/**
 * Builds the WhatsApp-friendly one-message summary a business owner receives
 * weekly. Kept plain (no markdown) so it renders identically as free text or
 * as a template body parameter.
 */
export function formatWeeklyReportMessage(
  businessName: string,
  report: RoiReport,
): string {
  const money = (n: number) =>
    "$" + Math.round(n).toLocaleString("es-AR");

  const lines = [
    `Resumen semanal de ${businessName}:`,
    ``,
    `${report.conversationsHandled} conversaciones atendidas`,
    `${report.aiSalesCount} ventas cerradas por la IA (${money(report.aiSalesRevenue)})`,
    `${money(report.totalSalesRevenue)} facturados en total`,
  ];
  if (report.recoveredCartsCount > 0) {
    lines.push(
      `${report.recoveredCartsCount} carritos recuperados (${money(report.recoveredCartsRevenue)})`,
    );
  }
  if (report.newContacts > 0) {
    lines.push(`${report.newContacts} clientes nuevos`);
  }
  return lines.join("\n");
}

export interface TopProduct {
  name: string;
  qty: number;
  revenue: number;
}

/**
 * Monthly summary — richer than the weekly one: adds the top products of the
 * month so the owner sees not just how much the AI sold, but what. Kept plain
 * text so it works as a template body parameter or a free-text message.
 */
export function formatMonthlyReportMessage(
  businessName: string,
  report: RoiReport,
  topProducts: TopProduct[] = [],
): string {
  const money = (n: number) => "$" + Math.round(n).toLocaleString("es-AR");

  const lines = [
    `Resumen del mes de ${businessName}:`,
    ``,
    `${report.conversationsHandled} conversaciones atendidas`,
    `${report.resolvedWithoutHuman} resueltas sin intervención humana`,
    `${report.aiSalesCount} ventas cerradas por la IA (${money(report.aiSalesRevenue)})`,
    `${money(report.totalSalesRevenue)} facturados en total`,
  ];
  if (report.recoveredCartsCount > 0) {
    lines.push(
      `${report.recoveredCartsCount} carritos recuperados (${money(report.recoveredCartsRevenue)})`,
    );
  }
  if (report.newContacts > 0) {
    lines.push(`${report.newContacts} clientes nuevos`);
  }
  if (topProducts.length > 0) {
    lines.push(``, `Más vendidos:`);
    for (const p of topProducts.slice(0, 3)) {
      lines.push(`- ${p.name} (${p.qty}u · ${money(p.revenue)})`);
    }
  }
  return lines.join("\n");
}
