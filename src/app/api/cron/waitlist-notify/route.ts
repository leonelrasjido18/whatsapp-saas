// waitlist-notify — notifies customers when a product they waited for is back in
// stock. Runs every 30 min. Only sends inside the open 24h window (free-text);
// otherwise the entry stays pending for a future window.

import { NextResponse } from "next/server";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { dispatchText } from "@/features/inbox/services/dispatch";

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
    const { data: pending } = await supabase
      .from("waitlist")
      .select("id, workspace_id, product_id, conversation_id, product:products(name, stock_qty)")
      .is("notified_at", null)
      .limit(300);

    let sent = 0;
    for (const w of pending ?? []) {
      const product = w.product as unknown as {
        name: string;
        stock_qty: number | null;
      } | null;
      // Only notify once there's real stock again.
      if (!product || product.stock_qty == null || product.stock_qty <= 0) continue;

      const conversationId = w.conversation_id as string | null;
      if (conversationId) {
        const result = await dispatchText({
          workspaceId: w.workspace_id as string,
          conversationId,
          body: `¡Buenas noticias! Ya tenemos stock de "${product.name}" otra vez. ¿Te lo reservo?`,
        });
        if (result.ok) sent++;
      }

      // Mark handled regardless so we don't loop on a closed window.
      await supabase
        .from("waitlist")
        .update({ notified_at: new Date().toISOString() })
        .eq("id", w.id as string);
    }

    return NextResponse.json({ ok: true, sent });
  } catch (err) {
    console.error("[Cron waitlist-notify] exception:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "error" },
      { status: 500 },
    );
  }
}
