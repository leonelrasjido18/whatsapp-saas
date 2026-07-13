import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: workspaceId } = await params;
    const supabase = await createClient();

    // Comprobamos permisos del usuario actual en el workspace
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { data: member } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .single();

    if (!member) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    // Consultamos directamente la tabla de contactos que ahora tiene columnas persistentes
    const { data, error } = await supabase
      .from("contacts")
      .select("id, name, phone, created_at, customer_tier, total_spent, last_purchase_at")
      .eq("workspace_id", workspaceId)
      .order("total_spent", { ascending: false });

    if (error) {
      console.error("[Clients Route] Error:", error);
      return NextResponse.json({ error: "Error fetch clients" }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
