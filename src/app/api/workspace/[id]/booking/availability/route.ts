import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireWorkspaceMember,
  readJsonBody,
} from "@/lib/auth/workspace-access";
import {
  getAvailabilityRules,
  replaceAvailabilityRules,
} from "@/features/booking/services/booking";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;
  const auth = await requireWorkspaceMember(workspaceId);
  if (!auth.ok) return auth.response;

  const rules = await getAvailabilityRules(workspaceId);
  return NextResponse.json({ data: rules });
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const RulesSchema = z.object({
  rules: z
    .array(
      z.object({
        weekday: z.number().int().min(0).max(6),
        start_time: z.string().regex(TIME),
        end_time: z.string().regex(TIME),
      }),
    )
    .max(50),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;
  const auth = await requireWorkspaceMember(workspaceId, { minRole: "manager" });
  if (!auth.ok) return auth.response;

  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.response;
  const body = RulesSchema.safeParse(parsed.body);
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  // Reject inverted ranges (end must be after start).
  for (const r of body.data.rules) {
    if (r.end_time <= r.start_time) {
      return NextResponse.json(
        { error: "La hora de cierre debe ser posterior a la de apertura" },
        { status: 400 },
      );
    }
  }

  try {
    await replaceAvailabilityRules(workspaceId, body.data.rules);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[PUT booking/availability]:", err);
    return NextResponse.json({ error: "Error al guardar los horarios" }, { status: 500 });
  }
}
