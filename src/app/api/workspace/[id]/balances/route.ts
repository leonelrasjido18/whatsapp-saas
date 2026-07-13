import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireWorkspaceMember, requireWorkspaceFeature } from "@/lib/auth/workspace-access";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: workspaceId } = await params;
    
    const auth = await requireWorkspaceMember(workspaceId);
    if (!auth.ok) return auth.response;

    const feat = await requireWorkspaceFeature(workspaceId, "catalog_sales");
    if (!feat.ok) return feat.response;

    const supabase = await createClient();

    // Llamamos a nuestra función RPC
    const { data, error } = await supabase.rpc("get_sales_metrics", {
      p_workspace_id: workspaceId
    });

    if (error) {
      console.error("[Balances Route] Error:", error);
      return NextResponse.json({ error: "Error fetch balances" }, { status: 500 });
    }

    return NextResponse.json({ data: data || { today: 0, week: 0, month: 0, total: 0 } });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
