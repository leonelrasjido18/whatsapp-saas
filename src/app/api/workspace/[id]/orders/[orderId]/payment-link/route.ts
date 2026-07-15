import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createCheckoutPreference } from "@/features/commerce/services/mercadopago";
import { getValidMpAccessToken } from "@/features/commerce/services/mercadopago-oauth";
import { requireWorkspaceMember } from "@/lib/auth/workspace-access";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; orderId: string }> }
) {
  try {
    const { id: workspaceId, orderId } = await params;
    const supabase = await createClient();

    // Validar acceso
    const authCheck = await requireWorkspaceMember(workspaceId);
    if (!authCheck.ok) {
      return authCheck.response;
    }

    // 1. Obtener la orden
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select(`
        *,
        items:order_items(*)
      `)
      .eq("workspace_id", workspaceId)
      .eq("id", orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });
    }

    if (order.status !== "pending") {
      return NextResponse.json({ error: "La orden no está pendiente" }, { status: 400 });
    }

    // 2. Obtener el access token de MercadoPago (OAuth con refresh, o el manual)
    const mp_access_token = await getValidMpAccessToken(supabase, workspaceId);
    if (!mp_access_token) {
      return NextResponse.json({ error: "Falta configurar MercadoPago" }, { status: 400 });
    }

    // 3. Generar la preferencia de pago
    const preference = await createCheckoutPreference(
      mp_access_token,
      order as any,
      workspaceId
    );

    if (!preference.init_point) {
      return NextResponse.json({ error: "Error al generar link de MercadoPago" }, { status: 500 });
    }

    // Guardar el preference_id en la orden
    await supabase
      .from("orders")
      .update({ mp_preference_id: preference.id })
      .eq("id", orderId);

    return NextResponse.json({ url: preference.init_point });
  } catch (err: any) {
    console.error("[Create Payment Link Route] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
