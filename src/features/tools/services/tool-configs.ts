import { createClient as createSbClient } from "@supabase/supabase-js";
import { registry } from "../registry";
import type { Tool } from "../core/tool";
import type { AgentType } from "@/features/agents/types";

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

interface ToolConfigRow {
  tool: { key?: string } | null;
  enabled: boolean;
  config: Record<string, unknown> | null;
}

// Per-stage tool policy for the sales pipeline. Each stage may only use the
// listed tools (intersected with what the workspace has enabled). Only applied
// when a stage is passed (pipeline on); otherwise every enabled tool is exposed.
//   setter       → Calificador: read + handoff, NO cobro.
//   soporte      → Ventas: catálogo + pedido + cobro.
//   agendamiento → Posventa: read + agenda, NO cobro.
const STAGE_TOOL_POLICY: Record<AgentType, Set<string>> = {
  setter: new Set([
    "catalog_search",
    "send_product_image",
    "get_order_status",
    "check_availability",
    "schedule_link",
    "schedule_highlevel",
    "custom_webhook",
    "handoff_a_ventas",
  ]),
  soporte: new Set([
    "catalog_search",
    "send_product_image",
    "create_order",
    "generate_payment_link",
    "get_order_status",
    "check_availability",
    "schedule_link",
    "schedule_highlevel",
    "custom_webhook",
  ]),
  agendamiento: new Set([
    "catalog_search",
    "get_order_status",
    "check_availability",
    "schedule_link",
    "schedule_highlevel",
    "custom_webhook",
  ]),
};

// The handoff tool is a system tool: always available in the Calificador stage,
// even without an explicit tool_configs row.
const ALWAYS_ON_BY_STAGE: Partial<Record<AgentType, string[]>> = {
  setter: ["handoff_a_ventas", "send_product_image"],
  soporte: ["send_product_image"],
};

/**
 * Returns the list of Tool instances that are enabled for a given workspace.
 * Reads the tool_configs table — if a tool has no row, it is considered disabled.
 *
 * When `stage` is provided (sales pipeline on), the result is additionally
 * filtered by the stage's tool policy, and stage system tools (e.g. the
 * handoff) are injected regardless of the toggles.
 */
export async function getEnabledTools(
  workspaceId: string,
  stage?: AgentType | null,
): Promise<Tool[]> {
  const supabase = svc();

  const { data } = await supabase
    .from("tool_configs")
    .select("tool:tools(key), enabled, config")
    .eq("workspace_id", workspaceId)
    .eq("enabled", true);

  const enabledKeys = new Set(
    ((data as ToolConfigRow[] | null) ?? [])
      .map((row) => row.tool?.key)
      .filter((k): k is string => typeof k === "string"),
  );

  let candidates: Tool[];
  if (!stage) {
    // No pipeline stage → every toggled-on tool.
    candidates = registry.list().filter((t) => enabledKeys.has(t.name));
  } else {
    const policy = STAGE_TOOL_POLICY[stage];
    for (const key of ALWAYS_ON_BY_STAGE[stage] ?? []) {
      enabledKeys.add(key);
    }
    candidates = registry
      .list()
      .filter((t) => enabledKeys.has(t.name) && policy.has(t.name));
  }

  // Enforce each tool's own gate (plan feature / configured credentials).
  // This is the single place plan-gating is applied to the agent runtime.
  const allowed = await Promise.all(
    candidates.map((t) => Promise.resolve(t.enabledFor(workspaceId))),
  );
  return candidates.filter((_, i) => allowed[i]);
}
