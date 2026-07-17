// analytics.ts — conversion funnel + team productivity. Read-only aggregates over
// contacts / conversations / messages / orders for the dashboard.

import { createClient as createSbClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

function svc(): SupabaseClient {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export interface FunnelStage {
  key: string;
  label: string;
  count: number;
}

export interface ConversionFunnel {
  stages: FunnelStage[];
  paidOrders: number;
  conversionRate: number; // paid orders / total contacts
}

const STAGE_ORDER: { key: string; label: string }[] = [
  { key: "new", label: "Nuevos" },
  { key: "engaged", label: "Interesados" },
  { key: "qualified", label: "Calificados" },
  { key: "customer", label: "Clientes" },
  { key: "lost", label: "Perdidos" },
];

/** Contacts grouped by CRM stage + paid-order conversion, over the last N days. */
export async function getConversionFunnel(
  workspaceId: string,
  days = 30,
): Promise<ConversionFunnel> {
  const supabase = svc();
  const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();

  const [{ data: contacts }, { count: paidOrders }] = await Promise.all([
    supabase
      .from("contacts")
      .select("stage")
      .eq("workspace_id", workspaceId)
      .gte("created_at", since),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("status", "paid")
      .gte("created_at", since),
  ]);

  const counts = new Map<string, number>();
  for (const c of contacts ?? []) {
    const s = (c.stage as string | null) ?? "new";
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }

  const stages: FunnelStage[] = STAGE_ORDER.map((s) => ({
    key: s.key,
    label: s.label,
    count: counts.get(s.key) ?? 0,
  }));

  const totalContacts = contacts?.length ?? 0;
  const conversionRate =
    totalContacts > 0 ? (paidOrders ?? 0) / totalContacts : 0;

  return { stages, paidOrders: paidOrders ?? 0, conversionRate };
}

export interface AgentProductivity {
  userId: string;
  name: string;
  messagesSent: number;
  conversations: number;
}

export interface TeamProductivity {
  agents: AgentProductivity[];
  avgFirstResponseMin: number | null;
  handledByAi: number;
  handledByHuman: number;
}

/**
 * Human-agent activity + overall first-response time over the last N days.
 * First response = minutes from a conversation's first inbound to its first
 * outbound reply (AI or human), averaged across conversations.
 */
export async function getTeamProductivity(
  workspaceId: string,
  days = 30,
): Promise<TeamProductivity> {
  const supabase = svc();
  const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();

  const { data: messages } = await supabase
    .from("messages")
    .select("conversation_id, direction, sender_user_id, created_at")
    .eq("workspace_id", workspaceId)
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(10000);

  const rows = messages ?? [];

  // Per-human-agent tallies.
  const byAgent = new Map<string, { messages: number; convs: Set<string> }>();
  let aiOut = 0;
  let humanOut = 0;

  for (const m of rows) {
    if (m.direction !== "out") continue;
    const uid = m.sender_user_id as string | null;
    if (uid) {
      humanOut++;
      const entry = byAgent.get(uid) ?? { messages: 0, convs: new Set() };
      entry.messages++;
      entry.convs.add(m.conversation_id as string);
      byAgent.set(uid, entry);
    } else {
      aiOut++;
    }
  }

  // Resolve agent names.
  const agentIds = Array.from(byAgent.keys());
  const nameById = new Map<string, string>();
  if (agentIds.length > 0) {
    const { data: users } = await supabase
      .from("users")
      .select("id, full_name")
      .in("id", agentIds);
    for (const u of users ?? []) {
      nameById.set(u.id as string, (u.full_name as string) ?? "Operador");
    }
  }

  const agents: AgentProductivity[] = agentIds
    .map((id) => ({
      userId: id,
      name: nameById.get(id) ?? "Operador",
      messagesSent: byAgent.get(id)!.messages,
      conversations: byAgent.get(id)!.convs.size,
    }))
    .sort((a, b) => b.messagesSent - a.messagesSent);

  // First-response time per conversation.
  const firstIn = new Map<string, number>();
  const firstOutAfter = new Map<string, number>();
  for (const m of rows) {
    const cid = m.conversation_id as string;
    const t = new Date(m.created_at as string).getTime();
    if (m.direction === "in") {
      if (!firstIn.has(cid)) firstIn.set(cid, t);
    } else if (m.direction === "out") {
      const inT = firstIn.get(cid);
      if (inT !== undefined && !firstOutAfter.has(cid) && t >= inT) {
        firstOutAfter.set(cid, t);
      }
    }
  }
  const deltas: number[] = [];
  for (const [cid, inT] of firstIn) {
    const outT = firstOutAfter.get(cid);
    if (outT !== undefined) deltas.push((outT - inT) / 60000);
  }
  const avgFirstResponseMin =
    deltas.length > 0
      ? Math.round((deltas.reduce((a, b) => a + b, 0) / deltas.length) * 10) / 10
      : null;

  return {
    agents,
    avgFirstResponseMin,
    handledByAi: aiOut,
    handledByHuman: humanOut,
  };
}
