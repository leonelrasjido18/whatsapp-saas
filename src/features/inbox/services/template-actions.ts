"use server";

import { listTemplates } from "./templates";
import { dispatchTemplate } from "./dispatch";
// NOTE: do NOT re-export types from a "use server" file — Next/Turbopack treats
// every export of an action module as an async action, and a re-exported type
// becomes an undefined runtime reference that crashes the whole actions chunk.
// Consumers import TemplateRow directly from "./templates".
import type { TemplateRow } from "./templates";

// ──────────────────────────────────────────────────────────────────────────────
// getApprovedTemplates
// ──────────────────────────────────────────────────────────────────────────────

export async function getApprovedTemplates(
  workspaceId: string,
): Promise<TemplateRow[]> {
  return listTemplates(workspaceId, "approved");
}

// ──────────────────────────────────────────────────────────────────────────────
// sendTemplateAction
// ──────────────────────────────────────────────────────────────────────────────

export async function sendTemplateAction(
  workspaceId: string,
  conversationId: string,
  templateName: string,
  language: string,
  variables: string[],
): Promise<{ ok: boolean; error?: string }> {
  const components =
    variables.length > 0
      ? [
          {
            type: "body" as const,
            parameters: variables.map((v) => ({
              type: "text" as const,
              text: v,
            })),
          },
        ]
      : undefined;

  const result = await dispatchTemplate({
    workspaceId,
    conversationId,
    templateName,
    templateLanguage: language,
    components,
  });

  if (!result.ok) {
    return { ok: false, error: result.error ?? "Error enviando template" };
  }

  return { ok: true };
}
