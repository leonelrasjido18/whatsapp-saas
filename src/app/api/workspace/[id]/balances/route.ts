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

    // ── Embudo de conversión del pipeline (Calificador → Ventas → Posventa) ──
    const [convCount, ventasEvents, posventaEvents, lowStock] = await Promise.all([
      supabase
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId),
      supabase
        .from("events")
        .select("conversation_id")
        .eq("workspace_id", workspaceId)
        .eq("type", "pipeline_stage_changed")
        .eq("payload->>to", "soporte")
        .limit(2000),
      supabase
        .from("events")
        .select("conversation_id")
        .eq("workspace_id", workspaceId)
        .eq("type", "pipeline_stage_changed")
        .eq("payload->>to", "agendamiento")
        .limit(2000),
      supabase
        .from("products")
        .select("name, stock_qty, low_stock_threshold")
        .eq("workspace_id", workspaceId)
        .eq("is_active", true)
        .eq("type", "product")
        .not("stock_qty", "is", null)
        .order("stock_qty", { ascending: true })
        .limit(20),
    ]);

    const distinct = (rows: { conversation_id: string | null }[] | null) =>
      new Set((rows ?? []).map((r) => r.conversation_id).filter(Boolean)).size;

    const lowStockProducts = (lowStock.data ?? []).filter(
      (p) => (p.stock_qty ?? 0) <= (p.low_stock_threshold ?? 5),
    );

    const enriched = {
      ...(data || { today: 0, week: 0, month: 0, total: 0 }),
      pipeline: {
        prospects: convCount.count ?? 0,
        to_ventas: distinct(ventasEvents.data),
        to_posventa: distinct(posventaEvents.data),
      },
      low_stock_products: lowStockProducts.map((p) => ({
        name: p.name,
        stock: p.stock_qty,
      })),
    };

    return NextResponse.json({ data: enriched });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
