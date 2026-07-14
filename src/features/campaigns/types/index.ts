export type CampaignStatus =
  | "draft"
  | "scheduled"
  | "sending"
  | "paused"
  | "done"
  | "failed";

export type RecipientStatus =
  | "pending"
  | "sent"
  | "delivered"
  | "read"
  | "failed"
  | "opted_out";

export type CustomerTier = "new" | "regular" | "vip" | "inactive";

/**
 * Serialized audience filter. All present fields are ANDed together. Absent
 * fields are ignored. Kept flat and JSON-serializable so it round-trips through
 * the campaigns.segment jsonb column and the wizard state unchanged.
 */
export interface CampaignSegment {
  /** Contact must have ALL of these tags. */
  tags?: string[];
  /** Contact's customer_tier is one of these. */
  tiers?: CustomerTier[];
  /** No purchase in the last N days (uses last_purchase_at). */
  inactiveDays?: number;
  /** Has purchased at least once (last_purchase_at is not null). */
  hasPurchased?: boolean;
  /** total_spent >= this amount. */
  minSpent?: number;
  /** Birthday falls in the current month (custom_fields.birthday MM-DD or ISO). */
  birthdayThisMonth?: boolean;
}

export interface CampaignStats {
  total: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  replies: number;
}

export interface Campaign {
  id: string;
  workspace_id: string;
  name: string;
  template_name: string;
  template_language: string;
  status: CampaignStatus;
  segment: CampaignSegment;
  scheduled_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  stats: CampaignStats;
  created_at: string;
  updated_at: string;
}
