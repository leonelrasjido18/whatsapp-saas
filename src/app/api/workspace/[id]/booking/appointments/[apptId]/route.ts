import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireWorkspaceMember,
  readJsonBody,
} from "@/lib/auth/workspace-access";
import { updateAppointmentStatus } from "@/features/booking/services/booking";

const PatchSchema = z.object({
  status: z.enum(["confirmed", "cancelled", "no_show", "done"]),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; apptId: string }> },
) {
  const { id: workspaceId, apptId } = await params;
  const auth = await requireWorkspaceMember(workspaceId, { minRole: "agent" });
  if (!auth.ok) return auth.response;

  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.response;
  const body = PatchSchema.safeParse(parsed.body);
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  const ok = await updateAppointmentStatus(workspaceId, apptId, body.data.status);
  if (!ok) {
    return NextResponse.json({ error: "No se pudo actualizar" }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
