// Storefront QR (#2). Generates a printable PNG QR that points to the public
// storefront URL, so the owner can stick it on the counter / packaging. Manager+.

import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { createClient as createSvcClient } from "@supabase/supabase-js";
import { requireWorkspaceMember } from "@/lib/auth/workspace-access";
import { getOrCreateStorefrontSettings } from "@/features/storefront/services/storefront";

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
  const auth = await requireWorkspaceMember(workspaceId, { minRole: "manager" });
  if (!auth.ok) return auth.response;

  try {
    const settings = await getOrCreateStorefrontSettings(svc(), workspaceId);
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const url = `${baseUrl}/tienda/${settings.public_key}`;

    const png = await QRCode.toBuffer(url, {
      type: "png",
      width: 600,
      margin: 2,
      errorCorrectionLevel: "M",
    });

    return new NextResponse(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": 'inline; filename="tienda-qr.png"',
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[GET storefront/qr]:", err);
    return NextResponse.json({ error: "Error al generar el QR" }, { status: 500 });
  }
}
