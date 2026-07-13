import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { requireWorkspaceMember, requireWorkspaceFeature, readJsonBody } from "@/lib/auth/workspace-access";
import { createOrder, getOrders } from "@/features/commerce/services/orders";

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const CreateOrderSchema = z.object({
  contact_id: z.string().uuid().optional(),
  conversation_id: z.string().uuid().optional(),
  source: z.enum(["chat", "manual"]),
  channel: z.string().optional(),
  items: z.array(z.object({
    product_id: z.string().uuid(),
    qty: z.number().int().min(1)
  })).min(1),
  note: z.string().optional(),
  discount: z.number().min(0).optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;

  const auth = await requireWorkspaceMember(workspaceId);
  if (!auth.ok) return auth.response;

  const feat = await requireWorkspaceFeature(workspaceId, "catalog_sales");
  if (!feat.ok) return feat.response;

  const searchParams = req.nextUrl.searchParams;
  const status = searchParams.get("status") as any;

  try {
    const orders = await getOrders(svc(), workspaceId, { status });
    return NextResponse.json({ data: orders });
  } catch (err) {
    console.error("[GET orders]:", err);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;

  const auth = await requireWorkspaceMember(workspaceId, { minRole: "agent" });
  if (!auth.ok) return auth.response;

  const feat = await requireWorkspaceFeature(workspaceId, "catalog_sales");
  if (!feat.ok) return feat.response;

  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.response;

  const body = CreateOrderSchema.safeParse(parsed.body);
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  try {
    const order = await createOrder(svc(), workspaceId, auth.userId, body.data);
    return NextResponse.json({ data: order }, { status: 201 });
  } catch (error: any) {
    console.error("[POST orders]:", error);
    return NextResponse.json({ error: error.message || "Error al crear la orden" }, { status: 500 });
  }
}
