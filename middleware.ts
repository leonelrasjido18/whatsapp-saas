import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options?: Record<string, unknown>;
          }[],
        ) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(
              name,
              value,
              options as Parameters<typeof supabaseResponse.cookies.set>[2],
            ),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Supabase Auth email links (recovery, etc.) should redirect to
  // /auth/confirm?code=...&next=..., but in this project Supabase has been
  // observed to collapse any custom redirect_to down to the bare Site URL
  // regardless of the redirect allow-list — landing the visitor on "/" (or
  // whatever path) with just "?code=...". Catch that here, BEFORE the
  // no-session redirect below would otherwise strip the code, and forward it
  // to /auth/confirm so the PKCE code still gets exchanged for a session.
  const authCode = request.nextUrl.searchParams.get("code");
  if (authCode && !pathname.startsWith("/auth/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/confirm";
    url.search = `?code=${encodeURIComponent(authCode)}&next=/reset-password`;
    return NextResponse.redirect(url);
  }

  // Routes reachable without a session.
  const publicRoutes = [
    "/login",
    "/signup",
    "/forgot-password",
    "/reset-password",
    // Legal pages — must stay public: Meta App Review validates these URLs
    // with a logged-out crawler.
    "/privacy",
    "/terms",
    "/data-deletion",
  ];
  // /pago/* is public too: the customer returning from a MercadoPago checkout
  // is an anonymous WhatsApp user with no session (prefix match — has subpaths).
  // /auth/* handles Supabase email-link callbacks (password reset, etc.) — the
  // visitor has no session yet when they land there.
  const isPublicRoute =
    publicRoutes.includes(pathname) ||
    pathname.startsWith("/pago/") ||
    // /r/* is the tracked Google-review redirect the customer opens from
    // WhatsApp — an anonymous visitor with no session.
    pathname.startsWith("/r/") ||
    // /tienda/* is the public storefront (#2) — anonymous shoppers, no session.
    pathname.startsWith("/tienda/") ||
    // Public self-service / shareable pages the customer opens from WhatsApp.
    pathname.startsWith("/presupuesto/") ||
    pathname.startsWith("/seguimiento/") ||
    pathname.startsWith("/turno/") ||
    pathname.startsWith("/auth/");

  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Authenticated users don't belong on entry auth pages — but /reset-password
  // is reached WITH a recovery session, so it must stay accessible.
  if (
    user &&
    (pathname === "/login" ||
      pathname === "/signup" ||
      pathname === "/forgot-password")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/inbox";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  // widget.js is the public embeddable chat script — it must load on external
  // sites without an auth redirect, so exclude it from the middleware like the
  // other static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|widget.js|sw.js|manifest.webmanifest|api/).*)"],
};
