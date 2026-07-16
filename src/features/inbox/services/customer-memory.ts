// customer-memory.ts — long-term memory per contact. Surfaces what we already
// know about this customer (past purchases, loyalty tier, notes) so the agent
// can be personal ("¿te mando lo de siempre?") instead of starting cold every
// time. Injected into the system prompt for each reply.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface CustomerMemory {
  block: string | null;
}

/**
 * Builds a short memory block for a contact. Cheap: two small queries, capped
 * lists. Returns null when there's nothing worth adding (new/anonymous contact).
 */
export async function buildCustomerMemory(
  supabase: SupabaseClient,
  workspaceId: string,
  contactId: string,
): Promise<string | null> {
  const [{ data: contact }, { data: orders }] = await Promise.all([
    supabase
      .from("contacts")
      .select("name, customer_tier, total_spent")
      .eq("id", contactId)
      .maybeSingle(),
    supabase
      .from("orders")
      .select("total, created_at, items:order_items(product_name, qty)")
      .eq("workspace_id", workspaceId)
      .eq("contact_id", contactId)
      .eq("status", "paid")
      .order("created_at", { ascending: false })
      .limit(3),
  ]);

  const lines: string[] = [];

  const tier = contact?.customer_tier as string | null | undefined;
  if (tier === "vip") {
    lines.push("Es un cliente VIP — tratalo con prioridad.");
  } else if (tier === "regular") {
    lines.push("Es un cliente habitual.");
  }

  const paidOrders = orders ?? [];
  if (paidOrders.length > 0) {
    lines.push(`Ya compró ${paidOrders.length} vez/veces. Últimas compras:`);
    for (const o of paidOrders) {
      const items = (o.items as Array<{ product_name: string; qty: number }> | null) ?? [];
      const summary =
        items.length > 0
          ? items.map((it) => `${it.qty}x ${it.product_name}`).join(", ")
          : `$${Number(o.total ?? 0).toLocaleString("es-AR")}`;
      lines.push(`- ${summary}`);
    }
  }

  if (lines.length === 0) return null;

  return (
    "## Lo que sabemos del cliente\n" +
    "Usá esto para ser cercano y personalizado (sin sonar invasivo):\n" +
    lines.join("\n")
  );
}
