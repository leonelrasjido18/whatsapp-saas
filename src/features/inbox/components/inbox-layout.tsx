"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ConversationItem } from "./conversation-item";
import { useRealtimeConversations } from "@/features/inbox/hooks/use-realtime-conversations";
import type {
  ConversationWithContact,
  ConversationState,
} from "@/features/inbox/types";

type FilterTab = "all" | "ai_active" | "human_active" | "handoff_pending";
type ChannelFilter = "all" | "whatsapp" | "facebook" | "instagram";

const TABS: { id: FilterTab; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "ai_active", label: "IA activa" },
  { id: "human_active", label: "Humano" },
  { id: "handoff_pending", label: "Handoff" },
];

const CHANNEL_FILTERS: { id: ChannelFilter; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "facebook", label: "Messenger" },
  { id: "instagram", label: "Instagram" },
];

interface InboxLayoutProps {
  conversations: ConversationWithContact[];
  workspaceId: string | null;
  children: React.ReactNode;
}

export function InboxLayout({
  conversations,
  workspaceId,
  children,
}: InboxLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [activeChannel, setActiveChannel] = useState<ChannelFilter>("all");

  // Live-update the list when chats arrive/change (new conversation, new
  // message, state/handoff change) — re-runs the server component.
  useRealtimeConversations(workspaceId);

  // Press Escape to leave the open conversation and return to the list.
  useEffect(() => {
    const inChat = /^\/inbox\/.+/.test(pathname);
    if (!inChat) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        router.push("/inbox");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pathname, router]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return conversations.filter((c) => {
      const matchesSearch =
        q === "" ||
        (c.contact.name ?? "").toLowerCase().includes(q) ||
        (c.contact.phone ?? "").toLowerCase().includes(q) ||
        (c.contact.external_id ?? "").toLowerCase().includes(q);

      const matchesTab =
        activeTab === "all" ||
        (c.state as ConversationState) === (activeTab as ConversationState);

      const matchesChannel =
        activeChannel === "all" ||
        (c.contact.channel ?? "whatsapp") === activeChannel;

      return matchesSearch && matchesTab && matchesChannel;
    });
  }, [conversations, search, activeTab, activeChannel]);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* Left panel — conversation list */}
      <aside
        className={cn(
          "w-80 shrink-0 border-r border-border/50 flex flex-col overflow-hidden",
        )}
        aria-label="Conversaciones"
      >
        {/* Header */}
        <div className="shrink-0 px-4 pt-3 pb-2 border-b border-border/50 space-y-2">
          <div className="flex items-baseline justify-between">
            <h1 className="font-display text-sm font-semibold text-foreground">
              Inbox
            </h1>
            <p className="text-xs text-muted-foreground">
              {filtered.length} de {conversations.length}
            </p>
          </div>

          {/* Search input */}
          <div className="relative">
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, tel o ID..."
              className="pl-8 h-8 text-xs bg-muted/30 border-border/40 placeholder:text-muted-foreground/50"
              aria-label="Buscar conversaciones"
            />
          </div>

          {/* Channel filter chips */}
          <div className="space-y-1">
            <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/60">
              Canal
            </p>
            <div
              role="tablist"
              aria-label="Filtrar por canal"
              className="flex gap-1 flex-wrap"
            >
              {CHANNEL_FILTERS.map((filter) => (
                <Button
                  key={filter.id}
                  type="button"
                  size="sm"
                  onClick={() => setActiveChannel(filter.id)}
                  className={cn(
                    "h-5 px-2 text-[10px] rounded-md transition-colors border",
                    activeChannel === filter.id
                      ? "bg-primary text-primary-foreground border-primary font-medium"
                      : "bg-background text-muted-foreground border-border/40 hover:text-foreground hover:bg-muted/40",
                  )}
                >
                  {filter.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Status filter tabs */}
          <div className="space-y-1 pt-1">
            <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/60">
              Estado
            </p>
            <div
              role="tablist"
              aria-label="Filtrar por estado"
              className="flex gap-1 flex-wrap"
            >
              {TABS.map((tab) => (
                <Button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  variant="ghost"
                  size="sm"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "h-5 px-2 text-[10px] rounded-md transition-colors border",
                    activeTab === tab.id
                      ? "bg-primary/10 text-primary border-primary/20 font-medium"
                      : "text-muted-foreground border-transparent hover:text-foreground hover:bg-muted/40",
                  )}
                >
                  {tab.label}
                </Button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <p className="text-sm text-muted-foreground">
                {search || activeTab !== "all" || activeChannel !== "all"
                  ? "Sin resultados"
                  : "No hay conversaciones"}
              </p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                {search || activeTab !== "all" || activeChannel !== "all"
                  ? "Intenta con otro filtro o búsqueda"
                  : "Los contactos aparecerán aquí"}
              </p>
            </div>
          ) : (
            <ul role="list">
              {filtered.map((conversation) => {
                const isActive = pathname.includes(conversation.id);
                return (
                  <li key={conversation.id}>
                    <ConversationItem
                      conversation={conversation}
                      isActive={isActive}
                      onClick={() => router.push(`/inbox/${conversation.id}`)}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      {/* Right panel — thread / detail */}
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
