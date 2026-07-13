import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { requireWorkspaceMember, requireWorkspaceFeature, readJsonBody } from "@/lib/auth/workspace-access";
import { getOrder, applyOrderPayment, cancelOrder, refundOrder } from "@/features/commerce/services/orders";

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; orderId: string }> },
) {
  const { id: workspaceId, orderId } = await params;

  const auth = await requireWorkspaceMember(workspaceId);
  if (!auth.ok) return auth.response;

  const feat = await requireWorkspaceFeature(workspaceId, "catalog_sales");
  if (!feat.ok) return feat.response;

  try {
    const order = await getOrder(svc(), workspaceId, orderId);
    return NextResponse.json({ data: order });
  } catch (err) {
    console.error("[GET order]:", err);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

const OrderActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("pay"),
    payment_method: z.enum(["efectivo", "transferencia", "mercadopago", "otro"]),
    mp_payment_id: z.string().optional(),
  }),
  z.object({ action: z.literal("cancel") }),
  z.object({ action: z.literal("refund") }),
]);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; orderId: string }> },
) {
  const { id: workspaceId, orderId } = await params;

  // All order actions require at least agent role
  const auth = await requireWorkspaceMember(workspaceId, { minRole: "agent" });
  if (!auth.ok) return auth.response;

  const feat = await requireWorkspaceFeature(workspaceId, "catalog_sales");
  if (!feat.ok) return feat.response;

  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.response;

  const body = OrderActionSchema.safeParse(parsed.body);
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  const action = body.data;

  // Refund is restricted to admin/manager only
  if (action.action === "refund" && !["admin", "manager"].includes(auth.role)) {
    return NextResponse.json({ error: "Solo admin/manager pueden reembolsar órdenes" }, { status: 403 });
  }

  try {
    if (action.action === "pay") {
      await applyOrderPayment(svc(), workspaceId, orderId, auth.userId, action.payment_method, action.mp_payment_id);
    } else if (action.action === "cancel") {
      await cancelOrder(svc(), workspaceId, orderId, auth.userId);
    } else if (action.action === "refund") {
      await refundOrder(svc(), workspaceId, orderId, auth.userId);
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    console.error("[POST order action]:", error);
    return NextResponse.json({ error: error.message || "Error al procesar la acción" }, { status: 500 });
  }
}
