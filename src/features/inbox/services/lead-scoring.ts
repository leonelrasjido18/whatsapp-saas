// lead-scoring.ts — computes a 0-100 "heat" score per contact so the owner sees
// who's worth chasing. Signals: recency of last inbound, engagement volume,
// buying intent (pending order), and whether they already bought. Run daily by a
// cron over contacts active in the last 30 days.

import { createClient as createSbClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

function svc(): SupabaseClient {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export interface LeadScoringSummary {
  contactsScored: number;
}

export function scoreLabel(score: number): "caliente" | "tibio" | "frio" {
  if (score >= 70) return "caliente";
  if (score >= 40) return "tibio";
  return "frio";
}

/**
 * Recomputes lead_score for every contact with activity in the last 30 days.
 * Kept intentionally simple and cheap — a handful of aggregate queries, then a
 * per-contact upsert of the score.
 */
export async function runLeadScoring(): Promise<LeadScoringSummary> {
  const supabase = svc();
  const now = Date.now();
  const since = new Date(now - 30 * 24 * 3600 * 1000).toISOString();

  // Candidate contacts: those active in the window.
  const { data: contacts } = await supabase
    .from("contacts")
    .select("id, workspace_id, last_message_at, total_spent, customer_tier")
    .gte("last_message_at", since);

  if (!contacts || contacts.length === 0) {
    return { contactsScored: 0 };
  }

  const ids = contacts.map((c) => c.id as string);

  // Inbound message counts per contact (via conversations → messages is heavy;
  // instead count messages by contact through conversations join).
  const { data: convs } = await supabase
    .from("conversations")
    .select("id, contact_id, state")
    .in("contact_id", ids);

  const convByContact = new Map<string, string[]>();
  const stateByContact = new Map<string, string>();
  for (const c of convs ?? []) {
    const cid = c.contact_id as string;
    const arr = convByContact.get(cid) ?? [];
    arr.push(c.id as string);
    convByContact.set(cid, arr);
    if (c.state) stateByContact.set(cid, c.state as string);
  }

  // Pending orders (intent) per contact.
  const { data: pendingOrders } = await supabase
    .from("orders")
    .select("contact_id")
    .in("contact_id", ids)
    .eq("status", "pending");
  const hasPending = new Set(
    (pendingOrders ?? []).map((o) => o.contact_id as string),
  );

  let scored = 0;
  const nowIso = new Date().toISOString();

  for (const c of contacts) {
    const id = c.id as string;
    let score = 0;

    // Recency (0-35)
    const last = c.last_message_at ? new Date(c.last_message_at as string).getTime() : 0;
    const ageH = last ? (now - last) / 3_600_000 : Infinity;
    if (ageH <= 24) score += 35;
    else if (ageH <= 72) score += 25;
    else if (ageH <= 168) score += 12;

    // Engagement (0-20): number of conversations as a proxy for touches.
    const convCount = convByContact.get(id)?.length ?? 0;
    score += Math.min(20, convCount * 7);

    // Intent (0-30): a pending order is a strong buy signal.
    if (hasPending.has(id)) score += 30;

    // History (0-15): already a customer.
    const spent = Number(c.total_spent ?? 0);
    if (spent > 0) score += 15;
    else if (c.customer_tier === "regular" || c.customer_tier === "vip") score += 10;

    score = Math.max(0, Math.min(100, Math.round(score)));

    await supabase
      .from("contacts")
      .update({ lead_score: score, lead_score_at: nowIso })
      .eq("id", id);
    scored++;
  }

  return { contactsScored: scored };
}
