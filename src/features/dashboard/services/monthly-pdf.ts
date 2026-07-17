// monthly-pdf.ts — generates the monthly report as a branded PDF (text-based,
// jsPDF, no canvas dependency). Reused by the on-demand dashboard download and
// by the monthly-report cron (uploaded to Storage, linked in the WhatsApp text).

import { jsPDF } from "jspdf";
import type { RoiReport, TopProduct } from "./roi-report";
import type { PlatformBranding } from "@/features/agency/services/branding";

function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace("#", "");
  const bigint = parseInt(m.length === 3 ? m.split("").map((c) => c + c).join("") : m, 16);
  return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
}

function money(n: number): string {
  return "$" + Math.round(n).toLocaleString("es-AR");
}

export function buildMonthlyReportPdf(opts: {
  businessName: string;
  branding: PlatformBranding;
  report: RoiReport;
  topProducts: TopProduct[];
  npsAvg: number | null;
}): Buffer {
  const { businessName, branding, report, topProducts, npsAvg } = opts;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const [r, g, b] = hexToRgb(branding.primary_color || "#2563eb");
  const marginX = 48;
  let y = 0;

  // Header band.
  doc.setFillColor(r, g, b);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 90, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("Reporte mensual", marginX, 40);
  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.text(businessName, marginX, 62);
  const periodLabel = `${new Date(report.from).toLocaleDateString("es-AR")} — ${new Date(report.to).toLocaleDateString("es-AR")}`;
  doc.setFontSize(9);
  doc.text(periodLabel, marginX, 78);

  y = 130;
  doc.setTextColor(20, 20, 20);

  const metrics: [string, string][] = [
    ["Conversaciones atendidas", String(report.conversationsHandled)],
    ["Resueltas sin humano", String(report.resolvedWithoutHuman)],
    ["Ventas cerradas por la IA", `${report.aiSalesCount} (${money(report.aiSalesRevenue)})`],
    ["Facturado total", money(report.totalSalesRevenue)],
    ["Carritos recuperados", `${report.recoveredCartsCount} (${money(report.recoveredCartsRevenue)})`],
    ["Clientes nuevos", String(report.newContacts)],
  ];
  if (npsAvg !== null) {
    metrics.push(["Satisfacción (NPS)", `${npsAvg.toFixed(1)}/10`]);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Resumen", marginX, y);
  y += 20;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);

  for (const [label, value] of metrics) {
    doc.setTextColor(90, 90, 90);
    doc.text(label, marginX, y);
    doc.setTextColor(20, 20, 20);
    doc.setFont("helvetica", "bold");
    doc.text(value, 320, y);
    doc.setFont("helvetica", "normal");
    y += 20;
  }

  if (topProducts.length > 0) {
    y += 16;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(20, 20, 20);
    doc.text("Más vendidos", marginX, y);
    y += 20;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    for (const p of topProducts.slice(0, 5)) {
      doc.setTextColor(90, 90, 90);
      doc.text(`${p.name}`, marginX, y);
      doc.setTextColor(20, 20, 20);
      doc.text(`${p.qty}u · ${money(p.revenue)}`, 320, y);
      y += 18;
    }
  }

  // Footer.
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text(
    `${branding.brand_name} · Generado automáticamente`,
    marginX,
    doc.internal.pageSize.getHeight() - 30,
  );

  return Buffer.from(doc.output("arraybuffer"));
}
