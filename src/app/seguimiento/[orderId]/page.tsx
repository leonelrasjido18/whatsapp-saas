import { notFound } from "next/navigation";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { formatArs } from "@/features/commerce/lib/money";

export const dynamic = "force-dynamic";
export const metadata = { title: "Seguimiento de pedido" };

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const STEPS = [
  { key: "pending", label: "Pedido recibido" },
  { key: "paid", label: "Pago confirmado" },
  { key: "done", label: "Listo / entregado" },
];

const STATUS_TEXT: Record<string, string> = {
  pending: "Pendiente de pago",
  paid: "Pagado",
  cancelled: "Cancelado",
  refunded: "Reembolsado",
};

export default async function TrackingPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;

  // UUID guard — avoid a DB error on a malformed path.
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) notFound();

  const { data: order } = await svc()
    .from("orders")
    .select("order_number, status, total, payment_method, created_at, items:order_items(product_name, qty, line_total), workspace:workspaces(name)")
    .eq("id", orderId)
    .maybeSingle();

  if (!order) notFound();

  const businessName =
    (order.workspace as unknown as { name?: string } | null)?.name ?? "Tu pedido";
  const status = order.status as string;
  const items = (order.items as { product_name: string; qty: number; line_total: number }[]) ?? [];
  const cancelled = status === "cancelled" || status === "refunded";
  // How far along the stepper.
  const activeStep = status === "paid" ? 1 : status === "done" ? 2 : 0;

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900 py-10 px-4">
      <div className="mx-auto max-w-lg rounded-2xl border border-neutral-200 bg-white shadow-sm p-6">
        <p className="text-xs uppercase tracking-wide text-neutral-500">
          {businessName}
        </p>
        <h1 className="text-xl font-bold mt-1">
          Pedido #{order.order_number}
        </h1>
        <p className="text-sm text-neutral-500">
          {new Date(order.created_at as string).toLocaleDateString("es-AR")} ·{" "}
          <span className={cancelled ? "text-red-600 font-medium" : ""}>
            {STATUS_TEXT[status] ?? status}
          </span>
        </p>

        {!cancelled && (
          <ol className="mt-6 space-y-3">
            {STEPS.map((s, i) => (
              <li key={s.key} className="flex items-center gap-3">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                    i <= activeStep
                      ? "bg-emerald-500 text-white"
                      : "bg-neutral-200 text-neutral-500"
                  }`}
                >
                  {i <= activeStep ? "✓" : i + 1}
                </span>
                <span className={i <= activeStep ? "font-medium" : "text-neutral-500"}>
                  {s.label}
                </span>
              </li>
            ))}
          </ol>
        )}

        <div className="mt-6 border-t border-neutral-100 pt-4">
          <ul className="space-y-1 text-sm">
            {items.map((it, i) => (
              <li key={i} className="flex justify-between">
                <span>
                  {it.qty}× {it.product_name}
                </span>
                <span className="text-neutral-500">{formatArs(it.line_total)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex justify-between font-semibold">
            <span>Total</span>
            <span>{formatArs(Number(order.total))}</span>
          </div>
        </div>
      </div>
    </main>
  );
}
