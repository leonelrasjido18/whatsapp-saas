import { PenLine, Bot } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MessageRow } from "@/features/inbox/types";
import { StatusIcon } from "./status-icon";
import { MessageAttachment } from "./message-attachment";
import { MessageFeedback } from "./message-feedback";

interface ChatMessageProps {
  message: MessageRow;
}

/** Author chip for outbound messages: "IA" badge or the operator's name. */
function OutboundAuthor({ message }: { message: MessageRow }) {
  // AI-generated when there is no human sender.
  if (!message.sender_user_id) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded bg-primary/15 px-1 text-[9px] font-semibold uppercase tracking-wide text-primary">
        <Bot className="h-2.5 w-2.5" aria-hidden="true" />
        IA
      </span>
    );
  }
  const name = message.sender?.full_name ?? "Operador";
  const initial = name.trim()[0]?.toUpperCase() ?? "·";
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
      <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-foreground/15 text-[8px] font-semibold text-foreground">
        {initial}
      </span>
      {name}
    </span>
  );
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("es", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function isInternalNote(message: MessageRow): boolean {
  return (
    message.type === "system" &&
    message.meta != null &&
    (message.meta as Record<string, unknown>).internal === true
  );
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isOutbound = message.direction === "out";
  const time = formatTime(message.created_at);
  const internal = isInternalNote(message);

  // Internal note — centered, amber tint, italic
  if (internal) {
    return (
      <div className="flex justify-center my-1" role="note">
        <div className="max-w-[80%] rounded-lg px-3 py-2 space-y-1 bg-warning/8 border border-warning/20">
          <div className="flex items-center gap-1.5 text-warning">
            <PenLine className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="text-[10px] font-medium uppercase tracking-wide">
              Nota interna
            </span>
          </div>
          {message.body && (
            <p className="text-sm text-foreground/80 italic leading-relaxed whitespace-pre-wrap break-words">
              {message.body}
            </p>
          )}
          <div className="flex justify-end">
            <span
              className="font-mono text-[10px] text-muted-foreground/60"
              suppressHydrationWarning
            >
              {time}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex", isOutbound ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[75%] rounded-lg px-3 py-2 space-y-1 border shadow-sm",
          isOutbound
            ? "bg-lime-100 border-lime-300 text-lime-950 dark:bg-primary/10 dark:border-primary/30 dark:text-foreground rounded-tr-sm"
            : "bg-neutral-100 border-neutral-200 text-neutral-900 dark:bg-muted/50 dark:border-transparent dark:text-foreground rounded-tl-sm",
        )}
      >
        {message.type !== "text" && message.type !== "system" ? (
          <MessageAttachment media={message.meta} type={message.type} />
        ) : (
          message.body && (
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap break-words">
              {message.body}
            </p>
          )
        )}

        <div
          className={cn(
            "flex items-center gap-1",
            isOutbound ? "justify-end" : "justify-start",
          )}
        >
          {isOutbound && message.type !== "system" && (
            <OutboundAuthor message={message} />
          )}
          <span
            className="font-mono text-[10px] text-muted-foreground"
            suppressHydrationWarning
          >
            {time}
          </span>
          {isOutbound && <StatusIcon status={message.status} />}
        </div>

        {/* #7 Train-from-inbox: rate the AI's replies (text/audio, no human
            sender). A 👎 correction becomes a KB entry. */}
        {isOutbound &&
          !message.sender_user_id &&
          (message.type === "text" || message.type === "audio") &&
          message.body && (
            <MessageFeedback
              workspaceId={message.workspace_id}
              messageId={message.id}
            />
          )}
      </div>
    </div>
  );
}
