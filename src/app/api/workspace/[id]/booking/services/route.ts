import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireWorkspaceMember,
  readJsonBody,
} from "@/lib/auth/workspace-access";
import { listServices, createService } from "@/features/booking/services/booking";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;
  const auth = await requireWorkspaceMember(workspaceId);
  if (!auth.ok) return auth.response;

  const services = await listServices(workspaceId);
  return NextResponse.json({ data: services });
}

const CreateSchema = z.object({
  name: z.string().min(1).max(200),
  duration_min: z.number().int().min(5).max(1440),
  price: z.number().min(0),
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

  try {
    const service = await createService(workspaceId, body.data);
    return NextResponse.json({ data: service }, { status: 201 });
  } catch (err) {
    console.error("[POST booking/services]:", err);
    return NextResponse.json({ error: "Error al crear el servicio" }, { status: 500 });
  }
}
