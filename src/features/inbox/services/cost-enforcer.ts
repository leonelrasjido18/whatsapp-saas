// F7: SEC-06 Cost Enforcer — hard budget enforcement with observable alert events.
// Distinct from cost-tracker.ts (which only records usage).
// This module ACTS on budget state: degrade or cut AI when thresholds are crossed.
// Now respects per-plan limits from the billing tiers.

import { createClient as createSbClient } from "@supabase/supabase-js";
import { getPlan, type PlanTier } from "@/features/billing/plans";

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export type CostPolicy = "allow" | "degrade" | "cut";

export interface CostPolicyResult {
  policy: CostPolicy;
  reason: string;
  fallbackModel?: string;
}

/**
 * Enforces the workspace daily token budget based on its plan tier.
 *
 * Reads today's llm_usage events and the workspace's plan, then:
 *   - >= DAILY_BUDGET * 1.5  → policy=cut (AI halted)
 *   - >= DEGRADE_THRESHOLD   → policy=degrade + cost_alert event
 *   - otherwise              → policy=allow
 *
 * Fails open on DB errors to avoid blocking legitimate traffic.
 */
export async function enforceCostPolicy(
  workspaceId: string,
): Promise<CostPolicyResult> {
  const supabase = svc();

  // Fetch workspace plan
  const { data: workspace, error: wsError } = await supabase
    .from("workspaces")
    .select("plan_tier")
    .eq("id", workspaceId)
    .single();

  if (wsError || !workspace) {
    console.error(
      "[cost-enforcer] failed to read workspace plan:",
      wsError,
    );
    // Fail open — don't block on DB errors
    return { policy: "allow", reason: "db_error_fail_open" };
  }

  const plan = getPlan(workspace.plan_tier as PlanTier);
  const warnThreshold = plan.degrade_threshold;
  const hardLimit = plan.daily_token_budget * 1.5; // 50% over budget = hard cut

  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);

  const { data: dailyEvents, error } = await supabase
    .from("events")
    .select("payload")
    .eq("type", "llm_usage")
    .eq("workspace_id", workspaceId)
    .gte("created_at", dayStart.toISOString());

  if (error) {
    console.error("[cost-enforcer] failed to read daily events:", error);
    // Fail open — don't block on DB errors
    return { policy: "allow", reason: "db_error_fail_open" };
  }

  const totalTokensToday = (dailyEvents ?? []).reduce((sum, row) => {
    const payload = row.payload as Record<string, unknown> | null;
    const t = payload?.total_tokens;
    return sum + (typeof t === "number" ? t : 0);
  }, 0);

  if (totalTokensToday >= hardLimit) {
    console.warn(
      `[cost-enforcer] workspace=${workspaceId} (${workspace.plan_tier}) hit hard limit: ${totalTokensToday} >= ${hardLimit} tokens`,
    );
    return { policy: "cut", reason: "daily_hard_limit" };
  }

  if (totalTokensToday >= warnThreshold) {
    // Insert an observable alert event — visible in the events stream
    await supabase.from("events").insert({
      type: "cost_alert",
      level: "warn",
      workspace_id: workspaceId,
      payload: {
        total_tokens_today: totalTokensToday,
        threshold: warnThreshold,
        hard_limit: hardLimit,
        plan_tier: workspace.plan_tier,
      },
    });

    console.warn(
      `[cost-enforcer] workspace=${workspaceId} (${workspace.plan_tier}) warn threshold crossed: ${totalTokensToday} >= ${warnThreshold} tokens`,
    );

    return {
      policy: "degrade",
      reason: "daily_warn_threshold",
      fallbackModel: "openai/gpt-4o-mini",
    };
  }

  return { policy: "allow", reason: "within_budget" };
}

const CUT_FALLBACK_MESSAGE =
  "Lo siento, el servicio de IA no está disponible temporalmente. " +
  "Por favor contacta a un representante humano para continuar.";

/**
 * Builds the final system prompt and model selection based on the active policy.
 *
 * - allow   → returns baseSystemPrompt unchanged, no model override
 * - degrade → returns a shortened prompt + fallbackModel from policy result
 * - cut     → caller MUST NOT invoke AI; the returned systemPrompt is the
 *             fallback message that should be sent directly to the user
 */
export async function buildCostAwareSystemPrompt(
  workspaceId: string,
  baseSystemPrompt: string,
  policy: CostPolicy,
): Promise<{ systemPrompt: string; model?: string }> {
  switch (policy) {
    case "cut":
      return { systemPrompt: CUT_FALLBACK_MESSAGE };

    case "degrade": {
      // Strip verbose instructions to reduce token spend further
      const shortened = baseSystemPrompt
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .slice(0, 20)
        .join("\n");

      console.info(
        `[cost-enforcer] workspace=${workspaceId} degraded prompt to ${shortened.length} chars`,
      );

      return {
        systemPrompt: shortened,
        model: "openai/gpt-4o-mini",
      };
    }

    case "allow":
    default:
      return { systemPrompt: baseSystemPrompt };
  }
}
