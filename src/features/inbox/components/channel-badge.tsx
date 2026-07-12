"use client";

import { MessageSquare } from "lucide-react";
import { Facebook, Instagram } from "@/components/icons";
import { cn } from "@/lib/utils";
import type { ConversationChannel } from "@/features/inbox/types";

interface ChannelBadgeProps {
  channel: ConversationChannel;
  showLabel?: boolean;
  className?: string;
  size?: "sm" | "md";
}

const CHANNEL_CONFIG = {
  whatsapp: {
    label: "WhatsApp",
    className: "text-[#25D366] bg-[#25D366]/10 border-[#25D366]/20",
    Icon: MessageSquare,
  },
  facebook: {
    label: "Messenger",
    className: "text-[#0084FF] bg-[#0084FF]/10 border-[#0084FF]/20",
    Icon: Facebook,
  },
  instagram: {
    label: "Instagram",
    className: "text-[#E1306C] bg-[#E1306C]/10 border-[#E1306C]/20",
    Icon: Instagram,
  },
};

export function ChannelBadge({
  channel,
  showLabel = false,
  className,
  size = "sm",
}: ChannelBadgeProps) {
  const config = CHANNEL_CONFIG[channel || "whatsapp"];
  if (!config) return null;

  const { label, className: themeClass, Icon } = config;

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-md border font-medium transition-colors select-none",
        themeClass,
        size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-xs",
        showLabel ? "gap-1.5" : "w-5 h-5 p-0",
        className,
      )}
      title={label}
      aria-label={label}
    >
      <Icon className={cn("shrink-0", size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5")} aria-hidden="true" />
      {showLabel && <span>{label}</span>}
    </span>
  );
}
