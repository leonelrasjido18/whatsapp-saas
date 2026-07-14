// Audience segmentation for campaigns. Turns a serialized CampaignSegment into
// a Supabase query over contacts, always excluding opted-out / non-opted-in
// contacts (Meta compliance). Used both for the audience-size preview and to
// materialize campaign_recipients at dispatch time.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CampaignSegment } from "../types";

export interface SegmentContact {
  id: string;
  phone: string;
  name: string | null;
}

/**
 * Applies the segment's predicates to an existing PostgREST filter builder.
 * The builder is fluent (each call returns itself); we thread it through a
 * loose type because the chained narrowing keeps the same runtime builder.
 */
function applyFilters<T>(query: T, segment: CampaignSegment): T {
  let q = query as unknown as {
    eq: (col: string, val: unknown) => typeof q;
    in: (col: string, vals: unknown[]) => typeof q;
    contains: (col: string, val: unknown) => typeof q;
    not: (col: string, op: string, val: unknown) => typeof q;
    gte: (col: string, val: unknown) => typeof q;
    or: (filter: string) => typeof q;
  };

  q = q.eq("opt_in", true).eq("campaign_opt_out", false);

  if (segment.tags && segment.tags.length > 0) {
    q = q.contains("tags", segment.tags);
  }
  if (segment.tiers && segment.tiers.length > 0) {
    q = q.in("customer_tier", segment.tiers);
  }
  if (segment.hasPurchased) {
    q = q.not("last_purchase_at", "is", null);
  }
  if (typeof segment.minSpent === "number") {
    q = q.gte("total_spent", segment.minSpent);
  }
  if (typeof segment.inactiveDays === "number") {
    const cutoff = new Date(
      Date.now() - segment.inactiveDays * 24 * 3600 * 1000,
    ).toISOString();
    q = q.or(`last_purchase_at.is.null,last_purchase_at.lt.${cutoff}`);
  }

  return q as unknown as T;
}

/** Current-month birthday check against custom_fields.birthday (MM-DD or ISO). */
function birthdayThisMonth(customFields: Record<string, unknown> | null): boolean {
  const raw = customFields?.birthday;
  if (typeof raw !== "string" || !raw.trim()) return false;
  const iso = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  const short = raw.match(/^(\d{2})-(\d{2})$/);
  const month = iso ? Number(iso[2]) : short ? Number(short[1]) : null;
  return month === new Date().getMonth() + 1;
}

/** Returns the number of contacts matching the segment (for the preview). */
export async function countAudience(
  supabase: SupabaseClient,
  workspaceId: string,
  segment: CampaignSegment,
): Promise<number> {
  // The birthday filter needs per-row parsing, so count the fetched set.
  if (segment.birthdayThisMonth) {
    const contacts = await fetchAudience(supabase, workspaceId, segment);
    return contacts.length;
  }

  const { count } = await applyFilters(
    supabase
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId),
    segment,
  );

  return count ?? 0;
}

/** Returns the contacts matching the segment (deduped, opted-in only). */
export async function fetchAudience(
  supabase: SupabaseClient,
  workspaceId: string,
  segment: CampaignSegment,
  limit = 5000,
): Promise<SegmentContact[]> {
  const needsBirthday = Boolean(segment.birthdayThisMonth);
  const select = needsBirthday
    ? "id, phone, name, custom_fields"
    : "id, phone, name";

  const { data, error } = await applyFilters(
    supabase.from("contacts").select(select).eq("workspace_id", workspaceId),
    segment,
  ).limit(limit);

  if (error) {
    console.error("[segments] fetchAudience error:", error);
    return [];
  }

  let rows = (data ?? []) as unknown as Array<{
    id: string;
    phone: string;
    name: string | null;
    custom_fields?: Record<string, unknown> | null;
  }>;

  if (needsBirthday) {
    rows = rows.filter((r) => birthdayThisMonth(r.custom_fields ?? null));
  }

  return rows
    .filter((r) => typeof r.phone === "string" && r.phone.length > 0)
    .map((r) => ({ id: r.id, phone: r.phone, name: r.name }));
}
