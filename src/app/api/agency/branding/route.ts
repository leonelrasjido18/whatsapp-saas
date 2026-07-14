// Platform branding (white-label) — GET/PUT. Super-admin only.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  getPlatformBranding,
  updatePlatformBranding,
} from "@/features/agency/services/branding";

async function requireSuperAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401 };

  const { data } = await supabase
    .from("users")
    .select("is_super_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (!data?.is_super_admin) return { ok: false as const, status: 403 };
  return { ok: true as const };
}

export async function GET() {
  const auth = await requireSuperAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: "No autorizado" }, { status: auth.status });
  }
  const branding = await getPlatformBranding();
  return NextResponse.json({ data: branding });
}

const UpdateSchema = z.object({
  brand_name: z.string().min(1).max(80).optional(),
  logo_url: z.string().url().max(1000).nullable().optional(),
  primary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  support_email: z.string().email().max(200).nullable().optional(),
});

export async function PUT(req: NextRequest) {
  const auth = await requireSuperAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: "No autorizado" }, { status: auth.status });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const branding = await updatePlatformBranding(parsed.data);
    return NextResponse.json({ data: branding });
  } catch (err) {
    console.error("[PUT agency/branding]:", err);
    return NextResponse.json({ error: "Error al guardar" }, { status: 500 });
  }
}
