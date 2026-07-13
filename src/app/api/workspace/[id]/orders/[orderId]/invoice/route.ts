import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createInvoice } from "@/features/commerce/services/afip";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; orderId: string }> }
) {
  try {
    const { id: workspaceId, orderId } = await params;
    const supabase = await createClient();

    // Check permissions
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { data: member } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .single();

    if (!member || !["admin", "manager"].includes(member.role)) {
      return NextResponse.json({ error: "Permisos insuficientes" }, { status: 403 });
    }

    let docType = 99;
    let docNumber = "0";

    try {
      const body = await req.json();
      if (body.docType) docType = body.docType;
      if (body.docNumber) docNumber = String(body.docNumber);
    } catch (e) {
      // Ignorar si no hay body
    }

    // Process invoice
    const result = await createInvoice(supabase, workspaceId, orderId, docType, docNumber);

    return NextResponse.json({ success: true, data: result });
  } catch (err: any) {
    console.error("[AFIP Invoice Error]:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
