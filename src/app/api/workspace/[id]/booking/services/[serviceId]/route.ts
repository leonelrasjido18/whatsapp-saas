import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceMember } from "@/lib/auth/workspace-access";
import { deleteService } from "@/features/booking/services/booking";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; serviceId: string }> },
) {
  const { id: workspaceId, serviceId } = await params;
  const auth = await requireWorkspaceMember(workspaceId, { minRole: "manager" });
  if (!auth.ok) return auth.response;

  try {
    await deleteService(workspaceId, serviceId);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE booking/services]:", err);
    return NextResponse.json({ error: "Error al eliminar" }, { status: 500 });
  }
}
