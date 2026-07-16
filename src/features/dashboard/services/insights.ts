// insights.ts — AI-generated business insights. Reads recent inbound customer
// messages and asks the LLM to surface: the most frequent questions, common
// objections, products/services customers ask for that aren't in the catalog,
// and the overall sentiment. Powers a dashboard panel + retention story.

import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { createClient as createSbClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getWorkspaceModel,
  getOpenRouterApiKey,
} from "@/features/inbox/services/openrouter";

function svc(): SupabaseClient {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export interface BusinessInsights {
  topQuestions: string[];
  objections: string[];
  missingProducts: string[];
  sentiment: string;
  summary: string;
}

export interface StoredInsights {
  data: BusinessInsights;
  generatedAt: string;
}

const SYSTEM_PROMPT = `Analizás los mensajes que los clientes le mandaron a un negocio por WhatsApp.
Devolvés EXCLUSIVAMENTE un JSON válido (sin markdown) con esta forma:
{
  "topQuestions": [string],      // las 3-5 preguntas/consultas más frecuentes
  "objections": [string],        // 2-4 objeciones o frenos de compra frecuentes
  "missingProducts": [string],   // productos/servicios que piden y que quizás no ofrecen
  "sentiment": string,           // una frase sobre el ánimo general de los clientes
  "summary": string              // 1-2 frases de recomendación accionable para el dueño
}
Sé concreto y basado SOLO en los mensajes. Si no hay datos para un campo, devolvé lista vacía o "".`;

function parseJsonLoose(text: string): unknown {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) t = t.slice(first, last + 1);
  return JSON.parse(t);
}

function strArray(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string").slice(0, 8)
    : [];
}

/** Reads the last stored insights (fast, no LLM). */
export async function getStoredInsights(
  workspaceId: string,
): Promise<StoredInsights | null> {
  const { data } = await svc()
    .from("workspace_insights")
    .select("data, generated_at")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!data) return null;
  return {
    data: data.data as BusinessInsights,
    generatedAt: data.generated_at as string,
  };
}

/**
 * Regenerates insights from the last 14 days of inbound messages and stores
 * them. Throws when there's no data or no LLM key.
 */
export async function regenerateInsights(
  workspaceId: string,
): Promise<StoredInsights> {
  const supabase = svc();
  const since = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();

  const { data: messages } = await supabase
    .from("messages")
    .select("body")
    .eq("workspace_id", workspaceId)
    .eq("direction", "in")
    .eq("type", "text")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(300);

  const texts = (messages ?? [])
    .map((m) => (m.body as string | null)?.trim())
    .filter((b): b is string => Boolean(b) && b !== "[Multimedia]");

  if (texts.length < 5) {
    throw new Error(
      "Todavía no hay suficientes mensajes para generar insights (necesito al menos ~5).",
    );
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

  const corpus = texts.slice(0, 300).join("\n").slice(0, 16000);
  const result = await generateText({
    model: openrouter.chat(model),
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Mensajes de clientes:\n\n${corpus}` },
    ],
    maxOutputTokens: 1024,
  });

  let parsed: Record<string, unknown>;
  try {
    parsed = parseJsonLoose(result.text) as Record<string, unknown>;
  } catch {
    throw new Error("La IA no devolvió un formato válido. Probá de nuevo.");
  }

  const insights: BusinessInsights = {
    topQuestions: strArray(parsed.topQuestions),
    objections: strArray(parsed.objections),
    missingProducts: strArray(parsed.missingProducts),
    sentiment: typeof parsed.sentiment === "string" ? parsed.sentiment : "",
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
  };

  const generatedAt = new Date().toISOString();
  await supabase
    .from("workspace_insights")
    .upsert(
      { workspace_id: workspaceId, data: insights, generated_at: generatedAt },
      { onConflict: "workspace_id" },
    );

  return { data: insights, generatedAt };
}
