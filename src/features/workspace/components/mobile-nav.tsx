"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  CalendarClock,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  Megaphone,
  Settings,
  ShoppingBag,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { logout } from "@/features/auth/services/actions";

interface MobileNavProps {
  showCommerce: boolean;
  showBookings: boolean;
  isSuperAdmin: boolean;
}

/**
 * Mobile navigation: a hamburger button that opens a slide-in drawer with all
 * the sections. Only rendered on small screens (the parent hides it on md+),
 * replacing both the cramped icon row and the old bottom bar.
 */
export function MobileNav({
  showCommerce,
  showBookings,
  isSuperAdmin,
}: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const items = [
    { href: "/inbox", label: "Inbox", Icon: MessageCircle, show: true },
    { href: "/ventas", label: "Ventas", Icon: ShoppingBag, show: showCommerce },
    { href: "/turnos", label: "Turnos", Icon: CalendarClock, show: showBookings },
    { href: "/campanas", label: "Campañas", Icon: Megaphone, show: true },
    { href: "/dashboard", label: "Dashboard", Icon: LayoutDashboard, show: true },
    { href: "/settings", label: "Configuración", Icon: Settings, show: true },
    { href: "/workspaces", label: "Agency", Icon: Building2, show: isSuperAdmin },
  ].filter((i) => i.show);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Abrir menú"
        aria-expanded={open}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </button>

      {/* Overlay + drawer */}
      <div
        className={cn(
          "fixed inset-0 z-[60] transition-opacity duration-200",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        aria-hidden={!open}
      >
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />

        {/* Panel */}
        <div
          className={cn(
            "absolute right-0 top-0 h-full w-72 max-w-[80vw]",
            "glass-strong border-l border-border/50 shadow-xl",
            "flex flex-col transition-transform duration-200 ease-out",
            open ? "translate-x-0" : "translate-x-full",
          )}
          role="dialog"
          aria-modal="true"
          aria-label="Menú de navegación"
        >
          <div className="flex items-center justify-between h-14 px-4 border-b border-border/50">
            <span className="font-display text-sm font-semibold text-foreground">
              Menú
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Cerrar menú"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto py-2">
            {items.map(({ href, label, Icon }) => {
              const active =
                pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 text-sm transition-colors",
                    active
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/40",
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                  {label}
                </Link>
              );
            })}
          </nav>

          <form action={logout} className="border-t border-border/50 p-2">
            <button
              type="submit"
              className="flex w-full items-center gap-3 rounded-md px-4 py-3 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
            >
              <LogOut className="h-5 w-5 shrink-0" aria-hidden="true" />
              Salir
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
