import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { requireWorkspaceMember, requireWorkspaceFeature, readJsonBody } from "@/lib/auth/workspace-access";
import { getProducts, createProduct } from "@/features/commerce/services/catalog";

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const CreateProductSchema = z.object({
  type: z.enum(["product", "service"]),
  name: z.string().min(1).max(512),
  description: z.string().optional(),
  category_id: z.string().uuid().optional(),
  sku: z.string().optional(),
  price: z.number().min(0),
  stock_qty: z.number().nullable().optional(),
  image_paths: z.array(z.string()).optional(),
  is_active: z.boolean().optional(),
});

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
    const products = await getProducts(svc(), workspaceId);
    return NextResponse.json({ data: products });
  } catch (err) {
    console.error("[GET products]:", err);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;

  const auth = await requireWorkspaceMember(workspaceId, { minRole: "manager" });
  if (!auth.ok) return auth.response;

  const feat = await requireWorkspaceFeature(workspaceId, "catalog_sales");
  if (!feat.ok) return feat.response;

  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.response;

  const body = CreateProductSchema.safeParse(parsed.body);
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  try {
    const product = await createProduct(svc(), workspaceId, body.data);
    return NextResponse.json({ data: product }, { status: 201 });
  } catch (error) {
    console.error("[POST products]:", error);
    return NextResponse.json({ error: "Error al crear el producto" }, { status: 500 });
  }
}
