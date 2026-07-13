export type ConversationChannel = "whatsapp" | "facebook" | "instagram";

export type ConversationState =
  | "ai_active"
  | "human_active"
  | "handoff_pending"
  | "waiting_reply"
  | "paused"
  | "closed";

/** Sales-pipeline stage of a conversation (reuses the agent_type enum). */
export type PipelineStage = "setter" | "soporte" | "agendamiento";

export type MessageDirection = "in" | "out";

export type MessageStatus = "queued" | "sent" | "delivered" | "read" | "failed";

export type MessageType =
  | "text"
  | "audio"
  | "image"
  | "document"
  | "video"
  | "sticker"
  | "location"
  | "template"
  | "system";

export interface ContactRow {
  id: string;
  workspace_id: string;
  /** E.164 phone — WhatsApp identity. NULL for Meta (Messenger/Instagram) contacts. */
  phone: string | null;
  /** Channel this contact belongs to (contacts are channel-scoped). */
  channel: ConversationChannel;
  /** PSID (facebook) or IGSID (instagram). NULL for WhatsApp contacts. */
  external_id: string | null;
  /** Profile picture URL (Meta profile enrichment). */
  avatar_url: string | null;
  name: string | null;
  email: string | null;
  stage: string | null;
  tags: string[] | null;
  opt_in: boolean;
  customer_tier?: "new" | "regular" | "vip" | "inactive";
  total_spent?: number;
  last_purchase_at?: string;
  created_at: string;
  updated_at: string;
}

export interface ConversationRow {
  id: string;
  workspace_id: string;
  contact_id: string;
  channel: ConversationChannel;
  state: ConversationState;
  ai_enabled: boolean;
  assigned_to: string | null;
  last_message_at: string | null;
  window_expires_at: string | null;
  unread_count: number;
  /** Sales-pipeline stage; null until the pipeline handles the conversation. */
  pipeline_stage?: PipelineStage | null;
  created_at: string;
  updated_at: string;
}

/** Operator who sent a manual outbound message (joined from `users`). */
export interface MessageSender {
  full_name: string;
  avatar_url: string | null;
}

export interface MessageRow {
  id: string;
  workspace_id: string;
  conversation_id: string;
  direction: MessageDirection;
  type: MessageType;
  body: string | null;
  wamid: string | null;
  status: MessageStatus;
  /** null = AI-generated, set = human operator (see `sender`). */
  sender_user_id: string | null;
  /** Joined operator info for manual messages; absent on realtime inserts. */
  sender?: MessageSender | null;
  meta: Record<string, unknown>;
  created_at: string;
}

export interface ConversationWithContact extends ConversationRow {
  contact: ContactRow;
  last_message: Pick<MessageRow, "body" | "direction" | "created_at"> | null;
}
