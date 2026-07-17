// prompt-improvement.ts — auto-mejora del agente. Analyzes conversations that
// went badly (lost leads, angry-customer alerts, corrected replies) and asks the
// LLM for concrete, additive prompt fixes. The owner reviews and applies with one
// click — "apply" creates a new published prompt version with the fix appended
// to the active agent's guardrail rules (never rewrites the whole prompt).

import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { createClient as createSbClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getWorkspaceModel,
  getOpenRouterApiKey,
} from "@/features/inbox/services/openrouter";
import {
  createPromptVersion,
  publishPromptVersion,
} from "@/features/inbox/services/prompt-resolver";
import type { PromptGuardrails } from "@/features/inbox/services/prompt-builder";

function svc(): SupabaseClient {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export interface PromptSuggestion {
  id: string;
  issue: string;
  evidence: string | null;
  suggested_addition: string;
  based_on_count: number;
  status: "pending" | "applied" | "dismissed";
  created_at: string;
}

const SYSTEM_PROMPT = `Sos un experto en optimizar agentes de IA de atención por WhatsApp.
Te paso evidencia de conversaciones que salieron mal (leads perdidos, clientes enojados, respuestas corregidas por el dueño).
Devolvés EXCLUSIVAMENTE un JSON válido (sin markdown) con esta forma:
{ "suggestions": [ { "issue": string, "suggested_addition": string } ] }
Reglas:
- "issue": el patrón detectado, en 1 frase (ej: "No aclara el costo de envío antes de pedir la seña").
- "suggested_addition": una regla concreta y accionable en español, lista para agregar tal cual a las instrucciones del agente (ej: "Aclará siempre el costo de envío ANTES de pedir cualquier pago.").
- Generá entre 2 y 5 sugerencias, solo si hay evidencia real que las respalde. No inventes.
- No repitas la misma sugerencia de dos formas distintas.`;

function parseJsonLoose(text: string): unknown {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) t = t.slice(first, last + 1);
  return JSON.parse(t);
}

/** Lists current suggestions (pending first). */
export async function listSuggestions(
  workspaceId: string,
): Promise<PromptSuggestion[]> {
  const { data } = await svc()
    .from("prompt_suggestions")
    .select("id, issue, evidence, suggested_addition, based_on_count, status, created_at")
    .eq("workspace_id", workspaceId)
    .order("status", { ascending: true }) // 'applied'/'dismissed' < 'pending' alphabetically? handled below
    .order("created_at", { ascending: false })
    .limit(30);
  const rows = (data as PromptSuggestion[]) ?? [];
  // Pending first, regardless of alpha order.
  return rows.sort((a, b) => (a.status === "pending" ? -1 : 1) - (b.status === "pending" ? -1 : 1));
}

/**
 * Gathers evidence from the last 30 days and asks the LLM for prompt fixes.
 * Clears previously pending suggestions before inserting the fresh batch, so
 * the list never accumulates stale/duplicate advice.
 */
export async function regenerateSuggestions(
  workspaceId: string,
): Promise<PromptSuggestion[]> {
  const supabase = svc();
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

  const [{ data: lostContacts }, { data: alerts }, { data: corrections }] =
    await Promise.all([
      supabase
        .from("contacts")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("stage", "lost")
        .gte("created_at", since)
        .limit(15),
      supabase
        .from("system_alerts")
        .select("title, body")
        .eq("workspace_id", workspaceId)
        .eq("kind", "angry_customer")
        .gte("created_at", since)
        .limit(10),
      supabase
        .from("message_feedback")
        .select("correction, message_id")
        .eq("workspace_id", workspaceId)
        .eq("rating", "down")
        .not("correction", "is", null)
        .gte("created_at", since)
        .limit(10),
    ]);

  const evidenceBlocks: string[] = [];
  let signalCount = 0;

  // Lost-lead conversations: last few messages each.
  for (const c of lostContacts ?? []) {
    const { data: conv } = await supabase
      .from("conversations")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("contact_id", c.id as string)
      .maybeSingle();
    if (!conv) continue;
    const { data: msgs } = await supabase
      .from("messages")
      .select("direction, body")
      .eq("conversation_id", conv.id as string)
      .eq("type", "text")
      .order("created_at", { ascending: false })
      .limit(6);
    const lines = (msgs ?? [])
      .reverse()
      .map((m) => `${m.direction === "in" ? "Cliente" : "Agente"}: ${m.body ?? ""}`)
      .filter((l) => l.length > 10);
    if (lines.length > 0) {
      evidenceBlocks.push(`[Lead perdido]\n${lines.join("\n")}`);
      signalCount++;
    }
  }

  for (const a of alerts ?? []) {
    evidenceBlocks.push(`[Cliente enojado] ${a.title}: ${a.body ?? ""}`);
    signalCount++;
  }

  for (const c of corrections ?? []) {
    evidenceBlocks.push(`[Corrección del dueño] Respuesta correcta: ${c.correction}`);
    signalCount++;
  }

  if (evidenceBlocks.length === 0) {
    return [];
  }

  const apiKey = await getOpenRouterApiKey(workspaceId);
  if (!apiKey || apiKey === "placeholder") {
    throw new Error("Falta la API key de IA (OpenRouter).");
  }
  const model = await getWorkspaceModel(workspaceId);
  const openrouter = createOpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey,
    headers: {
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
      "X-Title": "Agente WhatsApp",
    },
  });

  const corpus = evidenceBlocks.join("\n\n---\n\n").slice(0, 16000);
  const result = await generateText({
    model: openrouter.chat(model),
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: corpus },
    ],
    maxOutputTokens: 1500,
  });

  let parsed: Record<string, unknown>;
  try {
    parsed = parseJsonLoose(result.text) as Record<string, unknown>;
  } catch {
    throw new Error("La IA no devolvió un formato válido. Probá de nuevo.");
  }

  const suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];

  // Replace: drop old pending suggestions, insert the fresh batch.
  await supabase
    .from("prompt_suggestions")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("status", "pending");

  const rows = suggestions
    .map((s) => {
      const o = (s ?? {}) as Record<string, unknown>;
      const issue = typeof o.issue === "string" ? o.issue.trim() : "";
      const addition =
        typeof o.suggested_addition === "string" ? o.suggested_addition.trim() : "";
      if (!issue || !addition) return null;
      return {
        workspace_id: workspaceId,
        issue: issue.slice(0, 300),
        evidence: evidenceBlocks.slice(0, 3).join("\n").slice(0, 1000),
        suggested_addition: addition.slice(0, 500),
        based_on_count: signalCount,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .slice(0, 5);

  if (rows.length > 0) {
    await supabase.from("prompt_suggestions").insert(rows);
  }

  return listSuggestions(workspaceId);
}

/**
 * Applies a suggestion: appends the addition to the active agent's prompt
 * guardrail rules and publishes a new version. Marks the suggestion applied.
 */
export async function applySuggestion(
  workspaceId: string,
  suggestionId: string,
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = svc();

  const { data: suggestion } = await supabase
    .from("prompt_suggestions")
    .select("suggested_addition, status")
    .eq("id", suggestionId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (!suggestion || suggestion.status !== "pending") {
    return { ok: false, error: "Sugerencia no encontrada o ya resuelta" };
  }

  const { data: activeAgent } = await supabase
    .from("agents")
    .select("prompt_id")
    .eq("workspace_id", workspaceId)
    .eq("is_active", true)
    .maybeSingle();

  const promptId = activeAgent?.prompt_id as string | undefined;
  if (!promptId) {
    return { ok: false, error: "El workspace no tiene un agente activo con prompt" };
  }

  const { data: prompt } = await supabase
    .from("prompts")
    .select("active_version_id")
    .eq("id", promptId)
    .maybeSingle();

  const activeVersionId = prompt?.active_version_id as string | null;
  let body = "";
  let guardrails: PromptGuardrails = {};
  if (activeVersionId) {
    const { data: version } = await supabase
      .from("prompt_versions")
      .select("body, guardrails")
      .eq("id", activeVersionId)
      .maybeSingle();
    body = (version?.body as string) ?? "";
    guardrails = (version?.guardrails as PromptGuardrails) ?? {};
  }

  const newGuardrails: PromptGuardrails = {
    rules: [...(guardrails.rules ?? []), suggestion.suggested_addition as string],
    restrictions: guardrails.restrictions ?? [],
  };

  try {
    const newVersionId = await createPromptVersion(
      workspaceId,
      promptId,
      body,
      undefined,
      newGuardrails,
    );
    await publishPromptVersion(promptId, newVersionId);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Error al publicar",
    };
  }

  await supabase
    .from("prompt_suggestions")
    .update({ status: "applied", resolved_at: new Date().toISOString() })
    .eq("id", suggestionId);

  void userId; // reserved for future attribution/audit
  return { ok: true };
}

export async function dismissSuggestion(
  workspaceId: string,
  suggestionId: string,
): Promise<void> {
  await svc()
    .from("prompt_suggestions")
    .update({ status: "dismissed", resolved_at: new Date().toISOString() })
    .eq("id", suggestionId)
    .eq("workspace_id", workspaceId);
}
