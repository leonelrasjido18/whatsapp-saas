/**
 * Billing plans for the SaaS (Starter, Pro, Enterprise)
 * These are static definitions — plan details live here, not in the database.
 * Each workspace has a plan_tier column that references one of these plans.
 */

export type PlanTier = 'starter' | 'pro' | 'enterprise';

export interface Plan {
  tier: PlanTier;
  name: string;
  description: string;
  price_ars: number; // Monthly price in ARS
  price_usd?: number; // Optional USD pricing
  daily_token_budget: number; // Max tokens per day before degrading
  degrade_threshold: number; // When to switch to cheaper model (typically 80% of daily budget)
  max_agents: number; // How many agents can be active simultaneously
  max_team_members: number; // How many users can be added to workspace
  mercadopago_preapproval_plan_id?: string; // For recurring subscriptions (Preapproval)
  features: {
    knowledge_base: boolean;
    highlevel_sync: boolean;
    automation_rules: boolean;
    team_members: boolean;
    api_access: boolean;
  };
}

export const PLANS: Record<PlanTier, Plan> = {
  starter: {
    tier: 'starter',
    name: 'Starter',
    description: 'Perfect para pequeños negocios o pruebas',
    price_ars: 2900, // ~$35 USD / month
    daily_token_budget: 500_000, // 500k tokens/day
    degrade_threshold: 400_000, // Degrade at 80%
    max_agents: 1, // Only 1 agent (setter, soporte, or agendamiento — pick one)
    max_team_members: 2, // Owner + 1 teammate
    features: {
      knowledge_base: false,
      highlevel_sync: false,
      automation_rules: false,
      team_members: true,
      api_access: false,
    },
  },

  pro: {
    tier: 'pro',
    name: 'Pro',
    description: 'Para negocios en crecimiento',
    price_ars: 7900, // ~$95 USD / month
    daily_token_budget: 2_000_000, // 2M tokens/day
    degrade_threshold: 1_600_000, // Degrade at 80%
    max_agents: 3, // All 3 agents (setter + soporte + agendamiento)
    max_team_members: 5,
    features: {
      knowledge_base: true, // KB search + semantic search
      highlevel_sync: true, // Sync contacts to HighLevel
      automation_rules: true, // Auto-tagging, automation
      team_members: true,
      api_access: false,
    },
  },

  enterprise: {
    tier: 'enterprise',
    name: 'Enterprise',
    description: 'Para agencias y operaciones de alto volumen',
    price_ars: 19900, // ~$240 USD / month (or custom)
    daily_token_budget: 5_000_000, // 5M tokens/day
    degrade_threshold: 4_000_000, // Degrade at 80%
    max_agents: 3, // All agents
    max_team_members: 20, // Full team
    features: {
      knowledge_base: true,
      highlevel_sync: true,
      automation_rules: true,
      team_members: true,
      api_access: true, // Full API access for integrations
    },
  },
};

/**
 * Get a plan by tier
 */
export function getPlan(tier: PlanTier): Plan {
  return PLANS[tier];
}

/**
 * List all available plans
 */
export function listPlans(): Plan[] {
  return Object.values(PLANS);
}

/**
 * Check if a feature is available in a plan
 */
export function hasFeature(tier: PlanTier, feature: keyof Plan['features']): boolean {
  return PLANS[tier].features[feature];
}

/**
 * Get the token budget for a plan (respecting daily limits for cost enforcement)
 */
export function getDailyTokenBudget(tier: PlanTier): number {
  return PLANS[tier].daily_token_budget;
}

/**
 * Get the degrade threshold for a plan (when to switch to cheaper model)
 */
export function getDegradeThreshold(tier: PlanTier): number {
  return PLANS[tier].degrade_threshold;
}

/**
 * Get max active agents allowed for a plan
 */
export function getMaxAgents(tier: PlanTier): number {
  return PLANS[tier].max_agents;
}

/**
 * Get max team members for a plan
 */
export function getMaxTeamMembers(tier: PlanTier): number {
  return PLANS[tier].max_team_members;
}
