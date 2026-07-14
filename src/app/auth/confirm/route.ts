// Supabase Auth email-link callback (PKCE flow). Recovery/confirmation emails
// send the user here with a `?code=...` param — the SDK never auto-parses this
// (that only works for the legacy #access_token hash flow), so without this
// route the user lands on /reset-password with no session ("Falta la sesión
// de autenticación"). Exchanges the code for a session (sets cookies), then
// redirects to `next`.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/reset-password";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(
    `${origin}/login?message=${encodeURIComponent(
      "El enlace no es válido o expiró. Solicitá uno nuevo.",
    )}`,
  );
}
