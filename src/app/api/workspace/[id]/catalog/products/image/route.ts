import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { getSignedUrls } from "@/features/commerce/services/product-images";

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

const GetSignedUrlSchema = z.object({
  paths: z.array(z.string()).min(1),
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

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Body inválido" }, { status: 400 }); }

  const parsed = GetSignedUrlSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const urls = await getSignedUrls(svc(), parsed.data.paths);
    return NextResponse.json({ data: urls }, { status: 200 });
  } catch (error) {
    console.error("[POST products/image]:", error);
    return NextResponse.json({ error: "Error al generar URLs firmadas" }, { status: 500 });
  }
}
