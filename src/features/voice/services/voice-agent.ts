// voice-agent.ts — #4 IA telefónica. Integra con Vapi (https://vapi.ai), una
// plataforma de agentes de voz que maneja el pipeline en vivo (STT+LLM+TTS,
// interrupciones, latencia) — construir eso desde cero no es realista. Nosotros
// aportamos: el system prompt del negocio, las tools (reutilizando el registry
// existente vía webhook function-calling) y el registro de la llamada como
// conversación en el inbox.
//
// REQUISITOS (no son código, son pasos del dueño en vapi.ai):
//  1. Crear cuenta en vapi.ai y generar una API key.
//  2. Pegar la key acá y tocar "Sincronizar asistente" — creamos/actualizamos el
//     asistente con el prompt del negocio y las tools habilitadas.
//  3. En el panel de Vapi, comprar/importar un número de teléfono y asignarlo al
//     asistente creado (eso Vapi no lo expone vía esta integración — es un paso
//     manual con implicancias de facturación, mejor que quede en manos del dueño).
//
// Esta integración es best-effort contra la API pública de Vapi: si Vapi cambió
// campos desde que se escribió esto, el error de la sync se muestra tal cual para
// poder ajustarlo.

import { randomBytes } from "node:crypto";
import { createClient as createSbClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getBaseUrl } from "@/lib/utils";
import { resolveSystemPrompt } from "@/features/inbox/services/prompt-resolver";
import { getActiveAgent } from "@/features/agents/services/active-agent";
import { buildLocationsContext } from "@/features/workspace/services/locations";

const VAPI_BASE = "https://api.vapi.ai";

function svc(): SupabaseClient {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export interface VoiceIntegration {
  apiKey: string;
  assistantId: string | null;
  webhookSecret: string;
  enabled: boolean;
}

export async function getVoiceIntegration(
  workspaceId: string,
  client?: SupabaseClient,
): Promise<VoiceIntegration | null> {
  const supabase = client ?? svc();
  const { data } = await supabase
    .from("integrations")
    .select("credentials, config, enabled")
    .eq("workspace_id", workspaceId)
    .eq("provider", "vapi")
    .maybeSingle();
  if (!data) return null;
  const creds = (data.credentials as Record<string, unknown>) ?? {};
  const config = (data.config as Record<string, unknown>) ?? {};
  const apiKey = creds.vapi_api_key as string | undefined;
  if (!apiKey) return null;
  return {
    apiKey,
    assistantId: (config.assistant_id as string | undefined) ?? null,
    webhookSecret: (creds.webhook_secret as string | undefined) ?? "",
    enabled: Boolean(data.enabled),
  };
}

/** Finds the workspace whose Vapi assistant matches `assistantId`. */
export async function findWorkspaceByAssistantId(
  assistantId: string,
): Promise<{ workspaceId: string; apiKey: string; webhookSecret: string } | null> {
  const { data } = await svc()
    .from("integrations")
    .select("workspace_id, credentials, config")
    .eq("provider", "vapi")
    .eq("enabled", true);

  for (const row of data ?? []) {
    const config = (row.config as Record<string, unknown>) ?? {};
    if (config.assistant_id === assistantId) {
      const creds = (row.credentials as Record<string, unknown>) ?? {};
      return {
        workspaceId: row.workspace_id as string,
        apiKey: (creds.vapi_api_key as string) ?? "",
        webhookSecret: (creds.webhook_secret as string) ?? "",
      };
    }
  }
  return null;
}

/** JSON-Schema functions Vapi can call, built straight from our tools table. */
async function buildVapiFunctions(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<Array<{ type: "function"; function: { name: string; description: string; parameters: unknown } }>> {
  const { data } = await supabase
    .from("tool_configs")
    .select("enabled, tool:tools(key, name, description, schema)")
    .eq("workspace_id", workspaceId)
    .eq("enabled", true);

  const out: Array<{
    type: "function";
    function: { name: string; description: string; parameters: unknown };
  }> = [];
  for (const row of data ?? []) {
    const tool = row.tool as unknown as
      | { key: string; description: string; schema: unknown }
      | null;
    if (!tool) continue;
    out.push({
      type: "function",
      function: {
        name: tool.key,
        description: tool.description,
        parameters: tool.schema,
      },
    });
  }
  return out;
}

/** Builds the system prompt handed to Vapi's model at assistant-creation time. */
async function buildVoiceSystemPrompt(workspaceId: string): Promise<string> {
  const supabase = svc();
  const activeAgent = await getActiveAgent(workspaceId);
  const resolved = await resolveSystemPrompt(
    workspaceId,
    activeAgent ? { mode: activeAgent.type } : {},
  );
  const base =
    resolved?.body ??
    "Sos un asistente telefónico. Respondé de forma clara, cordial y breve.";

  const { data: businessInfo } = await supabase
    .from("business_info")
    .select("structured, free_text")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  const structured = (businessInfo?.structured as { name?: string } | null) ?? null;
  const freeText = (businessInfo?.free_text as string | null) ?? "";
  const bizBlock = [
    structured?.name ? `Negocio: ${structured.name}.` : "",
    freeText,
  ]
    .filter(Boolean)
    .join("\n");

  const locationsBlock = await buildLocationsContext(workspaceId).catch(() => "");

  const phoneNote =
    "## Formato de voz\n" +
    "Estás hablando por teléfono, en vivo. Hablá natural, como una persona: frases " +
    "cortas, sin markdown, sin emojis, sin listas. Si necesitás usar una herramienta " +
    "(consultar catálogo, agendar, etc.), hacelo y seguí la conversación con normalidad " +
    "mientras esperás el resultado.";

  return [bizBlock, locationsBlock, base, phoneNote].filter(Boolean).join("\n\n");
}

export interface SyncResult {
  ok: boolean;
  assistantId?: string;
  error?: string;
}

/**
 * Creates (first time) or updates the Vapi assistant for a workspace: system
 * prompt + tools + webhook. Stores the assistant id + a fresh webhook secret.
 */
export async function syncVapiAssistant(workspaceId: string): Promise<SyncResult> {
  const supabase = svc();
  const integration = await getVoiceIntegration(workspaceId, supabase);
  if (!integration) {
    return { ok: false, error: "Falta configurar la API key de Vapi." };
  }

  const [{ data: workspace }, systemPrompt, functions] = await Promise.all([
    supabase.from("workspaces").select("name").eq("id", workspaceId).maybeSingle(),
    buildVoiceSystemPrompt(workspaceId),
    buildVapiFunctions(supabase, workspaceId),
  ]);

  const webhookSecret =
    integration.webhookSecret || randomBytes(24).toString("hex");
  const serverUrl = `${getBaseUrl()}/api/webhooks/vapi`;

  const payload = {
    name: `${(workspace?.name as string) ?? "Negocio"} — Agente WhatsApp`,
    firstMessage: "¡Hola! Gracias por llamar, ¿en qué te puedo ayudar?",
    model: {
      provider: "openai",
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: systemPrompt }],
      tools: functions,
    },
    serverUrl,
    serverUrlSecret: webhookSecret,
  };

  try {
    const isUpdate = Boolean(integration.assistantId);
    const url = isUpdate
      ? `${VAPI_BASE}/assistant/${integration.assistantId}`
      : `${VAPI_BASE}/assistant`;
    const res = await fetch(url, {
      method: isUpdate ? "PATCH" : "POST",
      headers: {
        Authorization: `Bearer ${integration.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const body = (await res.json().catch(() => null)) as
      | Record<string, unknown>
      | null;
    if (!res.ok) {
      const msg =
        (body?.message as string | undefined) ??
        (body?.error as string | undefined) ??
        `Vapi respondió ${res.status}`;
      return { ok: false, error: msg };
    }

    const assistantId = (body?.id as string) ?? integration.assistantId ?? "";
    if (!assistantId) {
      return { ok: false, error: "Vapi no devolvió un ID de asistente." };
    }

    await supabase.from("integrations").upsert(
      {
        workspace_id: workspaceId,
        provider: "vapi",
        enabled: true,
        credentials: {
          vapi_api_key: integration.apiKey,
          webhook_secret: webhookSecret,
        },
        config: { assistant_id: assistantId },
      },
      { onConflict: "workspace_id,provider" },
    );

    return { ok: true, assistantId };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Error de red con Vapi",
    };
  }
}
