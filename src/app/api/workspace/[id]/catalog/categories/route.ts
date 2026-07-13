import { NextRequest, NextResponse } from "next/server";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { requireWorkspaceMember, requireWorkspaceFeature } from "@/lib/auth/workspace-access";
import { getCategories } from "@/features/commerce/services/catalog";

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;

  const auth = await requireWorkspaceMember(workspaceId);
  if (!auth.ok) return auth.response;

  const feat = await requireWorkspaceFeature(workspaceId, "catalog_sales");
  if (!feat.ok) return feat.response;

  try {
    const categories = await getCategories(svc(), workspaceId);
    return NextResponse.json({ data: categories });
  } catch (err) {
    console.error("[GET categories]:", err);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
