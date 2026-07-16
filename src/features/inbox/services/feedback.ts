// feedback.ts — #7 Train-from-inbox. Records 👍/👎 on the AI's replies and, when
// an operator writes a correction on a 👎, ingests it into the Knowledge Base so
// the agent answers better next time.

import type { SupabaseClient } from "@supabase/supabase-js";
import { ingestDocument } from "./kb-service";

export interface SubmitFeedbackInput {
  workspaceId: string;
  messageId: string;
  rating: "up" | "down";
  correction?: string | null;
  userId: string;
}

export interface SubmitFeedbackResult {
  ok: boolean;
  learned: boolean; // true when a correction was pushed to the KB
  error?: string;
}

/**
 * Records the rating (upsert — re-rating overwrites) and, for a 👎 with a
 * correction, builds a KB document pairing the customer's question with the
 * correct answer. Uses the caller's RLS-scoped client for the feedback row;
 * KB ingestion runs with the service role internally.
 */
export async function submitFeedback(
  supabase: SupabaseClient,
  input: SubmitFeedbackInput,
): Promise<SubmitFeedbackResult> {
  const { workspaceId, messageId, rating, correction, userId } = input;

  // Load the rated message (must belong to the workspace).
  const { data: message } = await supabase
    .from("messages")
    .select("id, conversation_id, body, workspace_id")
    .eq("id", messageId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (!message) {
    return { ok: false, learned: false, error: "Mensaje no encontrado" };
  }

  const conversationId = message.conversation_id as string;
  const trimmedCorrection = (correction ?? "").trim();
  let kbDocumentId: string | null = null;
  let learned = false;

  // A written correction on a 👎 → teach the KB.
  if (rating === "down" && trimmedCorrection.length > 0) {
    // Find the customer's question: the last inbound message before this reply.
    const { data: priorInbound } = await supabase
      .from("messages")
      .select("body, created_at")
      .eq("conversation_id", conversationId)
      .eq("direction", "in")
      .lt("created_at", (message as { created_at?: string }).created_at ?? new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const question = (priorInbound?.body as string | null)?.trim();
    const wrongAnswer = (message.body as string | null)?.trim();

    const parts = [
      question ? `Pregunta del cliente: ${question}` : null,
      `Respuesta correcta: ${trimmedCorrection}`,
      wrongAnswer ? `(La IA había respondido, incorrectamente: ${wrongAnswer})` : null,
    ].filter(Boolean);

    try {
      const result = await ingestDocument({
        workspaceId,
        title: question
          ? `Corrección: ${question.slice(0, 60)}`
          : "Corrección aprendida",
        content: parts.join("\n\n"),
        sourceType: "faq",
        meta: { origin: "inbox_feedback", message_id: messageId },
      });
      kbDocumentId = result.documentId;
      learned = true;
    } catch (err) {
      console.error("[feedback] KB ingest failed:", err);
      // Non-fatal — still record the rating below.
    }
  }

  const { error: upsertError } = await supabase
    .from("message_feedback")
    .upsert(
      {
        workspace_id: workspaceId,
        message_id: messageId,
        conversation_id: conversationId,
        rating,
        correction: trimmedCorrection || null,
        kb_document_id: kbDocumentId,
        created_by: userId,
      },
      { onConflict: "message_id" },
    );

  if (upsertError) {
    return { ok: false, learned, error: upsertError.message };
  }

  return { ok: true, learned };
}
