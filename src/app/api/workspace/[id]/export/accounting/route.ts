// Accounting export — an .xlsx with paid orders + AFIP invoices for a date range,
// ready to hand to the accountant. Manager+.

import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createClient as createSvcClient } from "@supabase/supabase-js";
import { requireWorkspaceMember } from "@/lib/auth/workspace-access";

function svc() {
  return createSvcClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;
  const auth = await requireWorkspaceMember(workspaceId, { minRole: "manager" });
  if (!auth.ok) return auth.response;

  const url = req.nextUrl;
  const from =
    url.searchParams.get("from") ??
    new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const to = url.searchParams.get("to") ?? new Date().toISOString();

  const supabase = svc();

  const [{ data: orders }, { data: invoices }] = await Promise.all([
    supabase
      .from("orders")
      .select("order_number, status, total, subtotal, discount, payment_method, source, channel, paid_at, created_at")
      .eq("workspace_id", workspaceId)
      .eq("status", "paid")
      .gte("created_at", from)
      .lte("created_at", to)
      .order("created_at", { ascending: true }),
    supabase
      .from("invoices")
      .select("invoice_type, point_of_sale, voucher_number, cae, cae_expires_at, doc_number, created_at")
      .eq("workspace_id", workspaceId)
      .gte("created_at", from)
      .lte("created_at", to)
      .order("created_at", { ascending: true }),
  ]);

  const orderRows = (orders ?? []).map((o) => ({
    "N° Orden": o.order_number,
    Fecha: (o.paid_at as string | null)?.slice(0, 10) ?? (o.created_at as string).slice(0, 10),
    Subtotal: Number(o.subtotal ?? 0),
    Descuento: Number(o.discount ?? 0),
    Total: Number(o.total ?? 0),
    "Método de pago": o.payment_method ?? "",
    Origen: o.source ?? "",
    Canal: o.channel ?? "",
  }));

  const invoiceRows = (invoices ?? []).map((i) => ({
    Tipo: i.invoice_type,
    "Punto de venta": i.point_of_sale,
    "N° Comprobante": i.voucher_number,
    CAE: i.cae,
    "Vto CAE": i.cae_expires_at,
    "Doc receptor": i.doc_number ?? "",
    Fecha: (i.created_at as string).slice(0, 10),
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(orderRows.length ? orderRows : [{ Aviso: "Sin ventas en el rango" }]),
    "Ventas",
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(invoiceRows.length ? invoiceRows : [{ Aviso: "Sin facturas en el rango" }]),
    "Facturas",
  );

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const fname = `contabilidad_${from.slice(0, 10)}_${to.slice(0, 10)}.xlsx`;

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fname}"`,
      "Cache-Control": "no-store",
    },
  });
}
