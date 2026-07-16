import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/features/auth/services/actions";
import {
  getActiveWorkspace,
  listMemberships,
} from "@/features/workspace/services/active-workspace";
import { WorkspaceSwitcher } from "@/features/workspace/components/workspace-switcher";
import { MobileNav } from "@/features/workspace/components/mobile-nav";
import { getPlatformBranding } from "@/features/agency/services/branding";
import {
  showsCommerce,
  showsBookings,
} from "@/features/workspace/lib/business-type";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Building2,
  CalendarClock,
  LayoutDashboard,
  LogOut,
  MessageCircle,
  Megaphone,
  Settings,
  ShoppingBag,
} from "lucide-react";
import Link from "next/link";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Super admin flag + active workspace context + membership list (for switcher)
  const branding = await getPlatformBranding();
  const [{ data: userRow }, active, memberships] = await Promise.all([
    supabase
      .from("users")
      .select("is_super_admin")
      .eq("id", user.id)
      .maybeSingle(),
    getActiveWorkspace(supabase, user.id),
    listMemberships(supabase, user.id),
  ]);

  const isSuperAdmin = userRow?.is_super_admin ?? false;
  const activeId = active?.workspace_id ?? null;
  const workspaceName =
    memberships.find((m) => m.workspace_id === activeId)?.name ?? null;

  // Module visibility by business type (default to showing everything).
  const businessType = active?.business_type ?? "general";
  const showCommerce = showsCommerce(businessType);
  const showBookings = showsBookings(businessType);

  return (
    <div className="min-h-screen flex flex-col">
      <header
        className={cn(
          "glass-strong sticky top-0 z-50 h-14 shrink-0",
          "flex items-center justify-between px-3 sm:px-6",
          "border-b border-border/50",
        )}
      >
        {/* Left: brand + workspace name */}
        <div className="flex items-center gap-2 min-w-0">
          {branding.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- external logo URL, no next/image loader configured
            <img
              src={branding.logo_url}
              alt={branding.brand_name}
              className="h-6 w-auto max-w-[140px] object-contain shrink-0"
            />
          ) : (
            <span className="font-display text-base font-semibold text-primary tracking-tight shrink-0">
              {branding.brand_name}
            </span>
          )}
          {workspaceName && (
            <>
              <span
                className="text-border/70 select-none shrink-0"
                aria-hidden="true"
              >
                /
              </span>
              {memberships.length > 1 && activeId ? (
                <WorkspaceSwitcher
                  workspaces={memberships.map((m) => ({
                    workspace_id: m.workspace_id,
                    name: m.name,
                  }))}
                  activeId={activeId}
                />
              ) : (
                <span
                  className="font-mono text-xs text-muted-foreground truncate max-w-[120px] sm:max-w-[200px]"
                  title={workspaceName}
                >
                  {workspaceName}
                </span>
              )}
            </>
          )}
        </div>

        {/* Right: nav. Icon row on desktop, hamburger drawer on mobile. */}
        <div className="flex items-center gap-1 shrink-0">
          <ThemeToggle />

          {/* Mobile: hamburger menu (hidden on md+) */}
          <div className="md:hidden">
            <MobileNav
              showCommerce={showCommerce}
              showBookings={showBookings}
              isSuperAdmin={isSuperAdmin}
            />
          </div>

          {/* Desktop: inline icon nav (hidden on mobile) */}
          <div className="hidden md:flex items-center gap-1">
          {isSuperAdmin && (
            <Link href="/workspaces">
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground"
              >
                <Building2 className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only sm:not-sr-only sm:ml-2">Agency</span>
              </Button>
            </Link>
          )}

          <Link href="/inbox">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground"
            >
              <MessageCircle className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only sm:not-sr-only sm:ml-2">Inbox</span>
            </Button>
          </Link>

          {showCommerce && (
            <Link href="/ventas">
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground"
              >
                <ShoppingBag className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only sm:not-sr-only sm:ml-2">Ventas</span>
              </Button>
            </Link>
          )}

          {showBookings && (
            <Link href="/turnos">
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground"
              >
                <CalendarClock className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only sm:not-sr-only sm:ml-2">Turnos</span>
              </Button>
            </Link>
          )}

          <Link href="/campanas">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground"
            >
              <Megaphone className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only sm:not-sr-only sm:ml-2">Campañas</span>
            </Button>
          </Link>

          <Link href="/dashboard">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground"
            >
              <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only sm:not-sr-only sm:ml-2">Dashboard</span>
            </Button>
          </Link>

          <Link href="/settings">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground"
            >
              <Settings className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only sm:not-sr-only sm:ml-2">Settings</span>
            </Button>
          </Link>

          <form action={logout}>
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only sm:not-sr-only sm:ml-2">Salir</span>
            </Button>
          </form>
          </div>
        </div>
      </header>

      <div className="flex-1">{children}</div>
    </div>
  );
}
