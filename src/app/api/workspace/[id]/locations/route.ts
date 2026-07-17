import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createSvcClient } from "@supabase/supabase-js";
import {
  requireWorkspaceMember,
  readJsonBody,
} from "@/lib/auth/workspace-access";
import {
  listLocations,
  createLocation,
  deleteLocation,
} from "@/features/workspace/services/locations";

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
  const data = await listLocations(svc(), workspaceId);
  return NextResponse.json({ data });
}

const CreateSchema = z.object({
  name: z.string().min(1).max(120),
  address: z.string().max(300).optional(),
  phone: z.string().max(40).optional(),
  hours: z.string().max(200).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;
  const auth = await requireWorkspaceMember(workspaceId, { minRole: "manager" });
  if (!auth.ok) return auth.response;

  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.response;
  const body = CreateSchema.safeParse(parsed.body);
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }
  const data = await createLocation(svc(), workspaceId, body.data);
  return NextResponse.json({ data }, { status: 201 });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;
  const auth = await requireWorkspaceMember(workspaceId, { minRole: "manager" });
  if (!auth.ok) return auth.response;
  const locationId = req.nextUrl.searchParams.get("locationId");
  if (!locationId) {
    return NextResponse.json({ error: "Falta locationId" }, { status: 400 });
  }
  await deleteLocation(svc(), workspaceId, locationId);
  return NextResponse.json({ ok: true });
}
