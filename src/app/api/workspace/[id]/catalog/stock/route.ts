import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { adjustStock } from "@/features/commerce/services/catalog";

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function resolveMember(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  userId: string,
) {
  const { data } = await supabase
    .from("memberships")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

const AdjustStockSchema = z.object({
  product_id: z.string().uuid(),
  delta: z.number().int(),
  type: z.enum(["venta", "compra", "ajuste", "devolucion"]),
  note: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const member = await resolveMember(supabase, workspaceId, user.id);
  if (!member) return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });

  if (!["admin", "manager"].includes(member.role as string)) {
    return NextResponse.json({ error: "Se requiere rol admin o manager" }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Body inválido" }, { status: 400 }); }

  const parsed = AdjustStockSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const newStock = await adjustStock(svc(), workspaceId, parsed.data.product_id, user.id, {
      delta: parsed.data.delta,
      type: parsed.data.type,
      note: parsed.data.note,
    });
    return NextResponse.json({ data: { stock_after: newStock } }, { status: 200 });
  } catch (error) {
    console.error("[POST stock]:", error);
    return NextResponse.json({ error: "Error al ajustar el stock" }, { status: 500 });
  }
}
