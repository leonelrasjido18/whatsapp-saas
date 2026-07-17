// Google Calendar OAuth callback — exchanges the code and stores the tokens for
// the workspace (state), after verifying the signed-in user is a member.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  exchangeCode,
  storeGoogleTokens,
} from "@/features/booking/services/google-calendar";

export async function GET(req: NextRequest) {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin;
  const code = req.nextUrl.searchParams.get("code");
  const workspaceId = req.nextUrl.searchParams.get("state");

  if (!code || !workspaceId) {
    return NextResponse.redirect(new URL("/turnos?google=error", base));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", base));

  // Verify the user is a manager/admin of the target workspace.
  const { data: member } = await supabase
    .from("memberships")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();
  if (!member || !["admin", "manager"].includes(member.role as string)) {
    return NextResponse.redirect(new URL("/turnos?google=denied", base));
  }

  try {
    const tokens = await exchangeCode(code);
    await storeGoogleTokens(workspaceId, tokens);
    return NextResponse.redirect(new URL("/turnos?google=ok", base));
  } catch (err) {
    console.error("[google/callback]:", err);
    return NextResponse.redirect(new URL("/turnos?google=error", base));
  }
}
