import { AlertCircle, Check, CheckCheck, Clock } from "lucide-react";
import type { MessageStatus } from "@/features/inbox/types";
import { cn } from "@/lib/utils";

interface StatusIconProps {
  status: MessageStatus | null;
}

export function StatusIcon({ status }: StatusIconProps) {
  if (!status) return null;

  switch (status) {
    case "queued":
      return (
        <Clock
          className={cn("h-3 w-3 shrink-0 opacity-50")}
          aria-label="En cola"
        />
      );
    case "sent":
      return (
        <Check
          className={cn("h-3 w-3 shrink-0 opacity-60")}
          aria-label="Enviado"
        />
      );
    case "delivered":
      return (
        <CheckCheck
          className={cn("h-3 w-3 shrink-0 opacity-60")}
          aria-label="Entregado"
        />
      );
    case "read":
      return (
        <CheckCheck
          className={cn("h-3 w-3 shrink-0 text-primary")}
          aria-label="Leído"
        />
      );
    case "failed":
      return (
        <AlertCircle
          className={cn("h-3 w-3 shrink-0 text-destructive")}
          aria-label="Fallido"
        />
      );
    default:
      return null;
  }
}
