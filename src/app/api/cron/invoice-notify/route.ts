// invoice-notify (#10) — sends the customer their AFIP invoice details over
// WhatsApp right after it's authorized, so they get the fiscal receipt in the
// chat without anyone doing it by hand. Free-text via the order's conversation
// (the customer just paid, so the 24h window is open). One send per invoice.

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
    const { data: invoices } = await supabase
      .from("invoices")
      .select(
        "id, workspace_id, order_id, invoice_type, point_of_sale, voucher_number, cae, order:orders(conversation_id)",
      )
      .is("notified_at", null)
      .limit(50);

    let sent = 0;
    for (const inv of invoices ?? []) {
      const order = inv.order as unknown as { conversation_id: string | null } | null;
      const conversationId = order?.conversation_id;
      // Always mark as handled so a missing conversation doesn't retry forever.
      if (!conversationId) {
        await supabase
          .from("invoices")
          .update({ notified_at: new Date().toISOString() })
          .eq("id", inv.id as string);
        continue;
      }

      const pos = String(inv.point_of_sale).padStart(4, "0");
      const num = String(inv.voucher_number).padStart(8, "0");
      const body =
        `¡Listo! Acá está tu factura ${inv.invoice_type}: N° ${pos}-${num}.\n` +
        `CAE: ${inv.cae}.\n¡Gracias por tu compra! 🧾`;

      const result = await dispatchText({
        workspaceId: inv.workspace_id as string,
        conversationId,
        body,
      });

      // Mark notified regardless (if the window was closed we don't want to spam
      // retries; the details are also visible in the panel).
      await supabase
        .from("invoices")
        .update({ notified_at: new Date().toISOString() })
        .eq("id", inv.id as string);

      if (result.ok) sent++;
    }

    return NextResponse.json({ ok: true, sent });
  } catch (err) {
    console.error("[Cron invoice-notify] exception:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "error" },
      { status: 500 },
    );
  }
}
