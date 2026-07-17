// loyalty-accrual — awards loyalty points for paid orders that haven't been
// credited yet. Idempotent via orders.points_awarded_at. Runs hourly.
// Default rate: 1 point per $100 (override via business_info.structured.loyalty_rate).

import { NextResponse } from "next/server";
import { createClient as createSbClient } from "@supabase/supabase-js";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const supabase = createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  try {
    const { data: orders } = await supabase
      .from("orders")
      .select("id, workspace_id, contact_id, total")
      .eq("status", "paid")
      .is("points_awarded_at", null)
      .not("contact_id", "is", null)
      .limit(500);

    // Cache per-workspace rate.
    const rateCache = new Map<string, number>();
    async function rateFor(wsId: string): Promise<number> {
      if (rateCache.has(wsId)) return rateCache.get(wsId)!;
      const { data } = await supabase
        .from("business_info")
        .select("structured")
        .eq("workspace_id", wsId)
        .maybeSingle();
      const raw = Number(
        (data?.structured as { loyalty_rate?: number } | null)?.loyalty_rate,
      );
      const rate = Number.isFinite(raw) && raw > 0 ? raw : 100;
      rateCache.set(wsId, rate);
      return rate;
    }

    let awarded = 0;
    for (const o of orders ?? []) {
      const wsId = o.workspace_id as string;
      const contactId = o.contact_id as string;
      const rate = await rateFor(wsId);
      const points = Math.floor(Number(o.total ?? 0) / rate);

      if (points > 0) {
        // Increment the contact's balance (read-modify-write; volumes are small).
        const { data: contact } = await supabase
          .from("contacts")
          .select("loyalty_points")
          .eq("id", contactId)
          .maybeSingle();
        const current = Number(contact?.loyalty_points ?? 0);
        await supabase
          .from("contacts")
          .update({ loyalty_points: current + points })
          .eq("id", contactId);
        awarded++;
      }

      await supabase
        .from("orders")
        .update({ points_awarded_at: new Date().toISOString() })
        .eq("id", o.id as string);
    }

    return NextResponse.json({ ok: true, awarded });
  } catch (err) {
    console.error("[Cron loyalty-accrual] exception:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "error" },
      { status: 500 },
    );
  }
}
