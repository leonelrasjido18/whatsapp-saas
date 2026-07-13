import { NextResponse } from "next/server";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { createInvoice } from "@/features/commerce/services/afip";

// Este cron corre cada 1 o 2 horas para reintentar órdenes pagadas sin factura
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
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    // Buscar órdenes pagadas, sin factura, de los últimos 3 días, que no estén procesándose
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const { data: orders, error } = await supabase
      .from("orders")
      .select("id, workspace_id")
      .eq("status", "paid")
      .is("invoice_cae", null)
      .gte("created_at", threeDaysAgo.toISOString())
      .limit(50); // Lote de a 50 para no timeout

    if (error) {
      console.error("[Cron invoice-retry] Error fetching orders:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!orders || orders.length === 0) {
      return NextResponse.json({ ok: true, message: "No pending invoices" });
    }

    let successCount = 0;
    let failCount = 0;

    for (const order of orders) {
      try {
        await createInvoice(supabase, order.workspace_id, order.id);
        successCount++;
      } catch (err: any) {
        // Ignoramos errores de "Faltan credenciales" ya que significa que el comercio no configuró AFIP
        if (err.message?.includes("Faltan credenciales AFIP")) {
          continue;
        }
        console.error(`[Cron invoice-retry] Failed for order ${order.id}:`, err);
        failCount++;
      }
    }

    return NextResponse.json({ ok: true, successCount, failCount });
  } catch (err: any) {
    console.error("[Cron invoice-retry] Exception:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
