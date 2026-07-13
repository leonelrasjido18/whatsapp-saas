import { cn } from "@/lib/utils";
import type {
  ConversationWithContact,
  ConversationState,
} from "@/features/inbox/types";
import { StateBadge } from "./state-badge";
import { ChannelBadge } from "./channel-badge";
import {
  PIPELINE_STAGE_LABEL,
  PIPELINE_STAGE_BADGE_CLASS,
} from "@/features/agents/lib/pipeline-stage-ui";

interface ConversationItemProps {
  conversation: ConversationWithContact;
  isActive: boolean;
  onClick: () => void;
}

function getInitials(name: string | null, phone: string | null, channel: string): string {
  if (name && name.trim().length > 0) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.trim().slice(0, 2).toUpperCase();
  }
  if (phone) return phone.slice(-4);
  return channel === "instagram" ? "IG" : channel === "facebook" ? "FB" : "??";
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString("es", {
    day: "numeric",
    month: "short",
  });
}

function truncate(text: string | null, max: number): string {
  if (!text) return "";
  return text.length > max ? text.slice(0, max) + "…" : text;
}

export function ConversationItem({
  conversation,
  isActive,
  onClick,
}: ConversationItemProps) {
  const { contact, last_message, unread_count, last_message_at } = conversation;
  const channel = contact.channel ?? "whatsapp";
  
  const displayName =
    contact.name ??
    contact.phone ??
    (channel === "instagram"
      ? "Usuario de Instagram"
      : channel === "facebook"
        ? "Usuario de Messenger"
        : "Usuario");

  const initials = getInitials(contact.name, contact.phone, channel);
  const preview = truncate(last_message?.body ?? null, 60);
  const time = timeAgo(last_message_at);

  const subIdentifier = contact.phone ?? (contact.external_id ? `ID: ${contact.external_id.slice(-8)}` : "");

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full flex items-start gap-3 px-4 py-3 text-left transition-colors duration-150",
        "hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        isActive && "glass",
      )}
      aria-current={isActive ? "page" : undefined}
    >
      {/* Avatar */}
      {contact.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={contact.avatar_url}
          alt={displayName}
          className="h-10 w-10 shrink-0 rounded-full object-cover border border-border/40"
          aria-hidden="true"
        />
      ) : (
        <div
          className={cn(
            "h-10 w-10 shrink-0 rounded-full flex items-center justify-center",
            "bg-neutral-200 text-neutral-700 dark:bg-primary/10 dark:text-primary",
            "font-mono text-xs font-semibold select-none",
          )}
          aria-hidden="true"
        >
          {initials}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-foreground truncate">
            {displayName}
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            <ChannelBadge channel={channel} size="sm" />
            <StateBadge state={conversation.state as ConversationState} />
            <span
              className="text-xs text-muted-foreground"
              suppressHydrationWarning
            >
              {time}
            </span>
          </div>
        </div>

        {conversation.pipeline_stage && (
          <div>
            <span
              className={cn(
                "inline-block rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider",
                PIPELINE_STAGE_BADGE_CLASS[conversation.pipeline_stage],
              )}
            >
              {PIPELINE_STAGE_LABEL[conversation.pipeline_stage]}
            </span>
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground truncate">{preview}</p>
          {unread_count > 0 && (
            <span
              className={cn(
                "shrink-0 h-4 min-w-4 px-1 rounded-full text-[10px] font-semibold",
                "bg-primary text-primary-foreground flex items-center justify-center",
              )}
              aria-label={`${unread_count} mensajes sin leer`}
            >
              {unread_count > 99 ? "99+" : unread_count}
            </span>
          )}
        </div>

        {subIdentifier && (
          <p className="font-mono text-[10px] text-muted-foreground/60 truncate">
            {subIdentifier}
          </p>
        )}
      </div>
    </button>
  );
}
