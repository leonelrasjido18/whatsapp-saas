"use client";

import { useTransition, useState } from "react";

interface UseAiToggleReturn {
  aiEnabled: boolean;
  toggle: () => void;
  isPending: boolean;
}

export function useAiToggle(
  conversationId: string,
  initialEnabled: boolean,
): UseAiToggleReturn {
  const [aiEnabled, setAiEnabled] = useState(initialEnabled);
  const [isPending, startTransition] = useTransition();

  const toggle = () => {
    const next = !aiEnabled;
    // Optimistic update
    setAiEnabled(next);

    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/conversations/${conversationId}/toggle-ai`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ai_enabled: next }),
          },
        );

        if (!res.ok) {
          // Revert on failure
          setAiEnabled(!next);
        }
      } catch {
        // Revert on network error
        setAiEnabled(!next);
      }
    });
  };

  return { aiEnabled, toggle, isPending };
}
