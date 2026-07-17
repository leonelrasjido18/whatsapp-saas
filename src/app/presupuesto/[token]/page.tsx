import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { formatArs } from "@/features/commerce/lib/money";
import { getPlatformBranding } from "@/features/agency/services/branding";

export const dynamic = "force-dynamic";

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

interface QuoteItem {
  description: string;
  unit_price: number;
  qty: number;
}

async function loadQuote(token: string) {
  const { data } = await svc()
    .from("quotes")
    .select("items, total, note, valid_until, created_at, workspace_id")
    .eq("public_token", token)
    .maybeSingle();
  if (!data) return null;
  const { data: ws } = await svc()
    .from("workspaces")
    .select("name")
    .eq("id", data.workspace_id as string)
    .maybeSingle();
  return { ...data, businessName: (ws?.name as string) ?? "Presupuesto" };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const q = await loadQuote(token);
  return { title: q ? `Presupuesto — ${q.businessName}` : "Presupuesto" };
}

export default async function QuotePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const quote = await loadQuote(token);
  if (!quote) notFound();

  const branding = await getPlatformBranding();
  const accent = branding.primary_color || "#2563eb";
  const items = (quote.items as QuoteItem[]) ?? [];

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900 py-10 px-4">
      <div className="mx-auto max-w-2xl rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
        <header className="px-6 py-6 text-white" style={{ background: accent }}>
          <p className="text-xs uppercase tracking-wide opacity-80">Presupuesto</p>
          <h1 className="text-2xl font-bold">{quote.businessName}</h1>
          <p className="text-sm opacity-90 mt-1">
            {new Date(quote.created_at as string).toLocaleDateString("es-AR")}
          </p>
        </header>

        <div className="p-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-500">
                <th className="py-2">Detalle</th>
                <th className="py-2 text-center">Cant.</th>
                <th className="py-2 text-right">Precio</th>
                <th className="py-2 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i} className="border-b border-neutral-100">
                  <td className="py-2.5">{it.description}</td>
                  <td className="py-2.5 text-center">{it.qty}</td>
                  <td className="py-2.5 text-right">{formatArs(it.unit_price)}</td>
                  <td className="py-2.5 text-right font-medium">
                    {formatArs(it.unit_price * it.qty)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 flex justify-end">
            <div className="text-right">
              <p className="text-xs uppercase text-neutral-500">Total</p>
              <p className="text-2xl font-bold">{formatArs(Number(quote.total))}</p>
            </div>
          </div>

          {quote.note && (
            <p className="mt-6 text-sm text-neutral-600 border-t border-neutral-100 pt-4 whitespace-pre-wrap">
              {quote.note as string}
            </p>
          )}
          {quote.valid_until && (
            <p className="mt-3 text-xs text-neutral-500">
              Válido hasta el{" "}
              {new Date(quote.valid_until as string).toLocaleDateString("es-AR")}.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
