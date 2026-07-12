import { createClient as createSbClient } from "@supabase/supabase-js";
import type {
  ContactRow,
  ConversationChannel,
  ConversationRow,
  MessageRow,
} from "../types/index";

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/** Default country code when a workspace hasn't configured one (Mexico). */
export const DEFAULT_COUNTRY_CODE = "52";

/**
 * Normalises a phone string to E.164 format.
 * - Trims whitespace and separators, prepends '+' if missing.
 * - When the number arrives WITHOUT a country code (no '+', national length
 *   ≤ 10 digits), prepends the workspace's `defaultCountryCode`.
 */
export function normalizePhone(
  phone: string,
  defaultCountryCode?: string,
): string {
  const trimmed = phone.trim().replace(/[\s\-()]/g, "");
  if (trimmed.startsWith("+")) return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  if (defaultCountryCode && digits.length > 0 && digits.length <= 10) {
    return `+${defaultCountryCode}${digits}`;
  }
  return `+${digits}`;
}

/**
 * Channel-scoped contact identity:
 * - WhatsApp contacts are keyed by E.164 phone (workspace_id + phone).
 * - Meta contacts are keyed by PSID/IGSID (workspace_id + channel + external_id).
 */
export type InboundIdentity =
  | { kind: "phone"; phone: string }
  | { kind: "external"; externalId: string };

export interface ProcessInboundParams {
  channel: ConversationChannel;
  identity: InboundIdentity;
  /** Display name when the provider sends one (YCloud customerProfile); null otherwise */
  profileName: string | null;
  /** message_type enum value */
  type: string;
  text: string | null;
  /** Provider message id (WhatsApp wamid / Meta mid) — dedup key, stored in messages.wamid */
  providerMessageId: string;
}

export interface ProcessInboundResult {
  contact: ContactRow;
  conversation: ConversationRow;
  message: MessageRow | null;
}

/**
 * Persists an inbound message and its related contact/conversation records.
 *
 * - Upserts the contact (by workspace_id + phone, or workspace_id + channel +
 *   external_id for Meta channels).
 * - Upserts the conversation (by workspace_id + contact_id + channel),
 *   incrementing unread_count and refreshing last_message_at.
 * - Inserts the message, deduplicating on workspace_id + wamid.
 *   Returns message: null when the provider message id already exists.
 */
export async function processInbound(
  workspaceId: string,
  params: ProcessInboundParams,
): Promise<ProcessInboundResult> {
  const supabase = svc();

  // 1. Upsert contact
  // A user messaging the business first is implicit opt-in for service
  // messages within the 24h window, so inbound contacts are opted in.
  // (STOP-keyword opt-out handling is future work and would guard this.)
  // Only send `name` when the provider gave one — an unconditional null would
  // wipe operator-set or enriched names on every inbound.
  const contactBase: Record<string, unknown> = {
    workspace_id: workspaceId,
    channel: params.channel,
    opt_in: true,
    opt_in_at: new Date().toISOString(),
    ...(params.profileName ? { name: params.profileName } : {}),
  };

  let contactUpsert;
  if (params.identity.kind === "phone") {
    // Per-workspace default country code for numbers without one.
    const { data: biRow } = await supabase
      .from("business_info")
      .select("structured")
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    const defaultCc =
      ((biRow?.structured as { default_country_code?: string } | null)
        ?.default_country_code as string) ?? DEFAULT_COUNTRY_CODE;

    contactUpsert = await supabase
      .from("contacts")
      .upsert(
        {
          ...contactBase,
          phone: normalizePhone(params.identity.phone, defaultCc),
        },
        { onConflict: "workspace_id,phone", ignoreDuplicates: false },
      )
      .select()
      .single();
  } else {
    contactUpsert = await supabase
      .from("contacts")
      .upsert(
        {
          ...contactBase,
          external_id: params.identity.externalId,
        },
        {
          onConflict: "workspace_id,channel,external_id",
          ignoreDuplicates: false,
        },
      )
      .select()
      .single();
  }

  const { data: contactData, error: contactError } = contactUpsert;

  if (contactError || !contactData) {
    throw new Error(
      `[normalizer] contact upsert failed: ${contactError?.message}`,
    );
  }

  const contact = contactData as ContactRow;

  // 2. Upsert conversation — reset 24h window on every inbound.
  // (Meta's standard messaging window is also 24h from the last user message.)
  const windowExpiresAt = new Date(
    Date.now() + 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data: convData, error: convError } = await supabase
    .from("conversations")
    .upsert(
      {
        workspace_id: workspaceId,
        contact_id: contact.id,
        channel: params.channel,
        last_message_at: new Date().toISOString(),
        window_expires_at: windowExpiresAt,
        unread_count: 1,
      },
      {
        onConflict: "workspace_id,contact_id,channel",
        ignoreDuplicates: false,
      },
    )
    .select()
    .single();

  if (convError || !convData) {
    throw new Error(
      `[normalizer] conversation upsert failed: ${convError?.message}`,
    );
  }

  const conversation = convData as ConversationRow;

  // 3. Insert message — deduplicate on provider message id
  const { data: msgData, error: msgError } = await supabase
    .from("messages")
    .upsert(
      {
        workspace_id: workspaceId,
        conversation_id: conversation.id,
        direction: "in" as const,
        type: params.type,
        body: params.text,
        wamid: params.providerMessageId,
        status: "delivered",
        meta: params.profileName ? { from_name: params.profileName } : {},
      },
      {
        onConflict: "workspace_id,wamid",
        ignoreDuplicates: true,
      },
    )
    .select()
    .single();

  // ignoreDuplicates: true means a conflict returns no rows — treat as dedup
  if (msgError && msgError.code !== "PGRST116") {
    throw new Error(`[normalizer] message insert failed: ${msgError?.message}`);
  }

  const message = msgData ? (msgData as MessageRow) : null;

  return { contact, conversation, message };
}
