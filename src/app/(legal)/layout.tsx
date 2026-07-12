import type { ReactNode } from "react";
import Link from "next/link";

/**
 * Shared layout for public legal pages (/privacy, /terms, /data-deletion).
 * These URLs are referenced in the Meta App dashboard and validated by
 * Meta's logged-out crawler — they must render without a session.
 */
export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50">
        <div className="mx-auto max-w-3xl px-6 py-4 flex items-center justify-between">
          <Link
            href="/"
            className="font-display text-sm font-semibold text-foreground"
          >
            Agente CRM Inbox
          </Link>
          <nav className="flex items-center gap-4 text-xs text-muted-foreground">
            <Link href="/privacy" className="hover:text-foreground">
              Privacidad
            </Link>
            <Link href="/terms" className="hover:text-foreground">
              Condiciones
            </Link>
            <Link href="/data-deletion" className="hover:text-foreground">
              Eliminación de datos
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-10">
        <article className="space-y-6 text-sm leading-relaxed text-foreground/90 [&_h1]:font-display [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:text-foreground [&_h2]:font-display [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground [&_h2]:mt-8 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_p]:text-muted-foreground [&_li]:text-muted-foreground [&_strong]:text-foreground">
          {children}
        </article>
      </main>
      <footer className="border-t border-border/50 mt-8">
        <div className="mx-auto max-w-3xl px-6 py-6 text-xs text-muted-foreground">
          Synory Dev ·{" "}
          <a href="mailto:desarrollo@synory.dev" className="underline">
            desarrollo@synory.dev
          </a>
        </div>
      </footer>
    </div>
  );
}
