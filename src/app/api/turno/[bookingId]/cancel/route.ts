// Public self-service booking cancel. The customer opens the link from WhatsApp
// (no session) and cancels. Only cancels pending/confirmed bookings.

import { NextRequest, NextResponse } from "next/server";
import { createClient as createSbClient } from "@supabase/supabase-js";

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  const { bookingId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(bookingId)) {
    return NextResponse.json({ error: "Inválido" }, { status: 400 });
  }

  const { error } = await svc()
    .from("bookings")
    .update({ status: "cancelled" })
    .eq("id", bookingId)
    .in("status", ["pending", "confirmed"]);

  if (error) {
    return NextResponse.json({ error: "No se pudo cancelar" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
