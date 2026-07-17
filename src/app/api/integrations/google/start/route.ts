// Starts Google Calendar OAuth for the active workspace.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/features/workspace/services/active-workspace";
import { buildAuthUrl, isGoogleConfigured } from "@/features/booking/services/google-calendar";

export async function GET() {
  if (!isGoogleConfigured()) {
    return NextResponse.json(
      { error: "Google no está configurado (faltan GOOGLE_CLIENT_ID/SECRET)." },
      { status: 400 },
    );
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_APP_URL));

  const membership = await getActiveWorkspace(supabase, user.id);
  if (!membership) {
    return NextResponse.json({ error: "Sin workspace activo" }, { status: 400 });
  }

  // State = workspace id; the callback re-verifies membership.
  return NextResponse.redirect(buildAuthUrl(membership.workspace_id));
}
