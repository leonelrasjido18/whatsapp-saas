import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireWorkspaceMember,
  readJsonBody,
} from "@/lib/auth/workspace-access";
import {
  listAppointmentsInRange,
  createAppointment,
} from "@/features/booking/services/booking";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;
  const auth = await requireWorkspaceMember(workspaceId);
  if (!auth.ok) return auth.response;

  // Default range: now → +30 days.
  const fromParam = req.nextUrl.searchParams.get("from");
  const toParam = req.nextUrl.searchParams.get("to");
  const from = fromParam ?? new Date().toISOString();
  const to =
    toParam ?? new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();

  const appointments = await listAppointmentsInRange(workspaceId, from, to);
  return NextResponse.json({ data: appointments });
}

const CreateSchema = z.object({
  starts_at: z.string().datetime({ offset: true }),
  service_id: z.string().uuid().nullable().optional(),
  customer_name: z.string().max(200).optional(),
  note: z.string().max(1000).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;
  const auth = await requireWorkspaceMember(workspaceId, { minRole: "agent" });
  if (!auth.ok) return auth.response;

  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.response;
  const body = CreateSchema.safeParse(parsed.body);
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  const result = await createAppointment({
    workspaceId,
    contactId: null,
    conversationId: null,
    serviceId: body.data.service_id ?? null,
    startsAt: body.data.starts_at,
    customerName: body.data.customer_name ?? null,
    note: body.data.note ?? null,
    createdBy: auth.userId,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }
  return NextResponse.json({ data: result.appointment }, { status: 201 });
}
