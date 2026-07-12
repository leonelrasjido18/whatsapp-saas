"use client";

import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface WindowBannerProps {
  windowExpiresAt: string | null;
  channel?: string;
}

export function WindowBanner({ windowExpiresAt, channel = "whatsapp" }: WindowBannerProps) {
  // No window tracked → treat as open
  if (windowExpiresAt === null) return null;

  // Window still open
  if (new Date(windowExpiresAt) > new Date()) return null;

  const isMeta = channel === "facebook" || channel === "instagram";
  const message = isMeta
    ? "La ventana de 24 horas expiró. Podrás responder cuando el cliente vuelva a escribir."
    : "Ventana 24h expirada — Solo puedes enviar templates aprobados";

  return (
    <div
      role="alert"
      className={cn(
        "flex items-center gap-2",
        "bg-amber-500/10 border border-amber-500/30 text-amber-400",
        "rounded-lg py-2 px-3 text-sm font-body",
      )}
    >
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}
