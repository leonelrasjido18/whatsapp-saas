import { createClient as svcClient } from "@supabase/supabase-js";
import type {
  ActiveAgent,
  AgentConfig,
  AgentType,
} from "@/features/agents/types";

/**
 * Returns the workspace's single active agent (model + prompt source of truth),
 * or null when none is active. Uses the service role — called from the runtime
 * (server-side, no user context). Fully back-compatible: callers fall back to
 * integrations.config.model + the global prompt when this returns null.
 */
export async function getActiveAgent(
  workspaceId: string,
): Promise<ActiveAgent | null> {
  try {
    const db = svcClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data } = await db
      .from("agents")
      .select("id, type, name, avatar_key, model, prompt_id, config")
      .eq("workspace_id", workspaceId)
      .eq("is_active", true)
      .maybeSingle();

    if (!data) return null;

    return {
      id: data.id as string,
      type: data.type as AgentType,
      name: data.name as string,
      avatarKey: (data.avatar_key as string) ?? "default",
      model: (data.model as string | null) ?? null,
      promptId: (data.prompt_id as string | null) ?? null,
      config: (data.config ?? {}) as AgentConfig,
    };
  } catch {
    return null;
  }
}

/**
 * Resolves the CURRENT pipeline stage for a conversation, or null when the
 * workspace's sales pipeline is disabled (back-compat: single active agent).
 * A NULL stored stage is treated as 'setter' (Calificador) — the entry point.
 */
export async function getConversationStage(
  workspaceId: string,
  conversationId: string,
): Promise<AgentType | null> {
  try {
    const db = svcClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data: ws } = await db
      .from("workspaces")
      .select("sales_pipeline_enabled")
      .eq("id", workspaceId)
      .maybeSingle();

    if (!ws?.sales_pipeline_enabled) return null;

    const { data: conv } = await db
      .from("conversations")
      .select("pipeline_stage")
      .eq("id", conversationId)
      .maybeSingle();

    return ((conv?.pipeline_stage as AgentType | null) ?? "setter") as AgentType;
  } catch {
    return null;
  }
}

/**
 * Like getConversationStage, but PERSISTS the default 'setter' stage the first
 * time a pipeline conversation is handled (so the inbox badge reflects it).
 * Returns null when the pipeline is disabled.
 */
export async function ensureConversationStage(
  workspaceId: string,
  conversationId: string,
): Promise<AgentType | null> {
  try {
    const db = svcClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data: ws } = await db
      .from("workspaces")
      .select("sales_pipeline_enabled")
      .eq("id", workspaceId)
      .maybeSingle();

    if (!ws?.sales_pipeline_enabled) return null;

    const { data: conv } = await db
      .from("conversations")
      .select("pipeline_stage")
      .eq("id", conversationId)
      .maybeSingle();

    const existing = (conv?.pipeline_stage as AgentType | null) ?? null;
    if (existing) return existing;

    // Persist the entry stage exactly once (only when still null).
    await db
      .from("conversations")
      .update({ pipeline_stage: "setter" })
      .eq("id", conversationId)
      .is("pipeline_stage", null);

    return "setter";
  } catch {
    return null;
  }
}

/**
 * Returns the agent that should handle THIS conversation. When the sales
 * pipeline is enabled, routes by the conversation's stage; otherwise falls
 * back to the workspace's single active agent (unchanged behavior).
 */
export async function getAgentForConversation(
  workspaceId: string,
  conversationId: string,
): Promise<ActiveAgent | null> {
  try {
    const stage = await getConversationStage(workspaceId, conversationId);
    if (!stage) return getActiveAgent(workspaceId);

    const db = svcClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data } = await db
      .from("agents")
      .select("id, type, name, avatar_key, model, prompt_id, config")
      .eq("workspace_id", workspaceId)
      .eq("type", stage)
      .maybeSingle();

    if (!data) return getActiveAgent(workspaceId);

    return {
      id: data.id as string,
      type: data.type as AgentType,
      name: data.name as string,
      avatarKey: (data.avatar_key as string) ?? "default",
      model: (data.model as string | null) ?? null,
      promptId: (data.prompt_id as string | null) ?? null,
      config: (data.config ?? {}) as AgentConfig,
    };
  } catch {
    return getActiveAgent(workspaceId);
  }
}
