import { NextResponse } from "next/server";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { INACTIVITY_DAYS } from "@/lib/tiering-rules";

// Este cron corre todos los días a las 00:00 (se debe configurar en vercel.json)
export async function GET(req: Request) {
  // Asegurar que el request viene de Vercel Cron (si usamos Vercel)
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
    const decayDate = new Date();
    decayDate.setDate(decayDate.getDate() - INACTIVITY_DAYS);

    // Bajar a inactive los contactos que no compraron en los últimos 90 días
    const { data, error } = await supabase
      .from("contacts")
      .update({ customer_tier: "inactive" })
      .lt("last_purchase_at", decayDate.toISOString())
      .neq("customer_tier", "inactive");

    if (error) {
      console.error("[Cron tier-decay] Error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[Cron tier-decay] Exception:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
