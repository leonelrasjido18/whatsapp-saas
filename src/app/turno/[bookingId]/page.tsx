import { notFound } from "next/navigation";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { CancelBookingButton } from "./cancel-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tu turno" };

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const STATUS_TEXT: Record<string, string> = {
  pending: "Reservado",
  confirmed: "Confirmado",
  cancelled: "Cancelado",
  no_show: "No asististe",
  done: "Realizado",
};

export default async function BookingPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(bookingId)) notFound();

  const { data: booking } = await svc()
    .from("bookings")
    .select("starts_at, status, customer_name, service:booking_services(name), workspace:workspaces(name)")
    .eq("id", bookingId)
    .maybeSingle();

  if (!booking) notFound();

  const businessName =
    (booking.workspace as unknown as { name?: string } | null)?.name ?? "Turno";
  const serviceName =
    (booking.service as unknown as { name?: string } | null)?.name ?? null;
  const status = booking.status as string;
  const starts = new Date(booking.starts_at as string);
  const active = status === "pending" || status === "confirmed";

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900 py-10 px-4">
      <div className="mx-auto max-w-md rounded-2xl border border-neutral-200 bg-white shadow-sm p-6 space-y-5">
        <div>
          <p className="text-xs uppercase tracking-wide text-neutral-500">
            {businessName}
          </p>
          <h1 className="text-xl font-bold mt-1">Tu turno</h1>
        </div>

        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-neutral-500">Fecha</dt>
            <dd className="font-medium">
              {starts.toLocaleDateString("es-AR", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-neutral-500">Hora</dt>
            <dd className="font-medium">
              {starts.toLocaleTimeString("es-AR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </dd>
          </div>
          {serviceName && (
            <div className="flex justify-between">
              <dt className="text-neutral-500">Servicio</dt>
              <dd className="font-medium">{serviceName}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-neutral-500">Estado</dt>
            <dd className="font-medium">{STATUS_TEXT[status] ?? status}</dd>
          </div>
        </dl>

        {active ? (
          <CancelBookingButton bookingId={bookingId} />
        ) : (
          <p className="rounded-lg bg-neutral-100 px-4 py-3 text-sm text-neutral-600 text-center">
            Este turno está {STATUS_TEXT[status]?.toLowerCase() ?? status}.
          </p>
        )}
      </div>
    </main>
  );
}
