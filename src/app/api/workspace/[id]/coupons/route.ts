import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createSvcClient } from "@supabase/supabase-js";
import {
  requireWorkspaceMember,
  requireWorkspaceFeature,
  readJsonBody,
} from "@/lib/auth/workspace-access";

function svc() {
  return createSvcClient(
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

  const { data } = await svc()
    .from("coupons")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  return NextResponse.json({ data: data ?? [] });
}

const CreateSchema = z.object({
  code: z.string().min(2).max(40),
  discount_type: z.enum(["percent", "amount"]),
  discount_value: z.number().positive(),
  min_order_total: z.number().min(0).optional(),
  max_uses: z.number().int().positive().nullable().optional(),
  expires_at: z.string().datetime().nullable().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;
  const auth = await requireWorkspaceMember(workspaceId, { minRole: "manager" });
  if (!auth.ok) return auth.response;

  const feat = await requireWorkspaceFeature(workspaceId, "ai_sales_tools");
  if (!feat.ok) return feat.response;

  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.response;
  const body = CreateSchema.safeParse(parsed.body);
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  // Percentages must be 1–100.
  if (body.data.discount_type === "percent" && body.data.discount_value > 100) {
    return NextResponse.json(
      { error: "Un descuento porcentual no puede superar 100%" },
      { status: 400 },
    );
  }

  const { data, error } = await svc()
    .from("coupons")
    .insert({
      workspace_id: workspaceId,
      code: body.data.code.trim().toUpperCase(),
      discount_type: body.data.discount_type,
      discount_value: body.data.discount_value,
      min_order_total: body.data.min_order_total ?? 0,
      max_uses: body.data.max_uses ?? null,
      expires_at: body.data.expires_at ?? null,
    })
    .select("*")
    .single();

  if (error) {
    // 23505 = unique violation (duplicate code for this workspace)
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Ya existe un cupón con ese código" },
        { status: 409 },
      );
    }
    console.error("[POST coupons]:", error);
    return NextResponse.json({ error: "Error al crear el cupón" }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}
