/**
 * dispatch.ts — SEC-04 single exit point for ALL outbound messages.
 *
 * ONLY dispatchText and dispatchTemplate should call sendText / sendTemplate.
 * No other module should invoke those functions directly for user-facing sends.
 *
 * Channel-aware: routes to YCloud (WhatsApp) or Meta Graph API (Messenger/IG).
 */

import { createClient as createSbClient } from "@supabase/supabase-js";
import { sendText, sendTemplate, sendImage } from "./ycloud-client";
import type { TemplateParams } from "./ycloud-client";
import { sendMetaText, isAuthError } from "./meta-client";
import { getMetaIntegration, flagMetaReconnectRequired } from "./meta-integration";
import { formatWhatsAppMarkdown, formatPlainText } from "./text-formatter";
import type { ConversationChannel } from "../types/index";

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Parameter interfaces
// ──────────────────────────────────────────────────────────────────────────────

export interface DispatchTextParams {
  workspaceId: string;
  conversationId: string;
  body: string;
  /** null = AI-generated, set = human agent */
  senderUserId?: string;
  /** Admin bypass for expired window — triggers a WINDOW_OVERRIDE DB log */
  overrideAdmin?: boolean;
}

export interface DispatchTemplateParams {
  workspaceId: string;
  conversationId: string;
  templateName: string;
  /** Defaults to 'es'. NEVER use 'es_PA' — Movinsa gotcha */
  templateLanguage?: string;
  components?: TemplateParams["components"];
  senderUserId?: string;
}

export interface DispatchResult {
  ok: boolean;
  wamid?: string;
  error?: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────────────────────────

interface IntegrationRow {
  credentials: Record<string, unknown>;
  config: Record<string, unknown>;
}

/** Unified send context — one query replaces the old 3-query approach. */
interface SendContext {
  channel: ConversationChannel;
  windowExpiresAt: string | null;
  contactId: string;
  /** E.164 phone for WhatsApp; null for Meta contacts */
  phone: string | null;
  /** PSID (FB) / IGSID (IG) for Meta contacts; null for WhatsApp */
  externalId: string | null;
  optIn: boolean;
}

/**
 * Loads all the context needed to send a message in a single join query.
 * Replaces the old loadConversationAndPhone + two redundant opt-out queries.
 */
async function loadSendContext(
  conversationId: string,
  supabase: ReturnType<typeof svc>,
): Promise<SendContext> {
  const { data: conv, error: convError } = await supabase
    .from("conversations")
    .select(
      "window_expires_at, channel, contact:contacts(id, phone, external_id, opt_in)",
    )
    .eq("id", conversationId)
    .single();

  if (convError || !conv) {
    throw new Error(`[dispatch] conversation not found: ${convError?.message}`);
  }

  // supabase-js returns the joined row as an object (single FK → !inner by default)
  const contact = conv.contact as unknown as {
    id: string;
    phone: string | null;
    external_id: string | null;
    opt_in: boolean;
  } | null;

  if (!contact) {
    throw new Error(
      `[dispatch] contact not found for conversation ${conversationId}`,
    );
  }

  return {
    channel: conv.channel as ConversationChannel,
    windowExpiresAt: conv.window_expires_at as string | null,
    contactId: contact.id,
    phone: contact.phone,
    externalId: contact.external_id,
    optIn: contact.opt_in,
  };
}

async function loadYCloudIntegration(
  workspaceId: string,
  supabase: ReturnType<typeof svc>,
): Promise<{ apiKey: string; fromPhone: string }> {
  const { data, error } = await supabase
    .from("integrations")
    .select("credentials, config")
    .eq("workspace_id", workspaceId)
    .eq("provider", "ycloud")
    .eq("enabled", true)
    .single();

  if (error || !data) {
    throw new Error(
      `[dispatch] YCloud integration not found: ${error?.message}`,
    );
  }

  const row = data as IntegrationRow;
  return {
    apiKey: (row.credentials.ycloud_api_key as string | undefined) ?? "",
    fromPhone: (row.config.phone_number as string | undefined) ?? "",
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// dispatchText — sends a free-text outbound message
// ──────────────────────────────────────────────────────────────────────────────
export async function dispatchText(
  params: DispatchTextParams,
): Promise<DispatchResult> {
  const {
    workspaceId,
    conversationId,
    body: rawBody,
    senderUserId,
    overrideAdmin = false,
  } = params;

  const supabase = svc();

  // 1. Load conversation + contact in one query
  const ctx = await loadSendContext(conversationId, supabase);

  // Format text per channel: WhatsApp gets *bold* syntax, Meta/webchat plain
  const isMeta = ctx.channel === "facebook" || ctx.channel === "instagram";
  const isWebchat = ctx.channel === "webchat";
  const body =
    isMeta || isWebchat
      ? formatPlainText(rawBody)
      : formatWhatsAppMarkdown(rawBody);

  // Webchat has no external transport and no 24h window: the reply is just
  // persisted and the browser widget polls for it. Handle it before the
  // opt-in / window guards, which don't apply to an on-page web session.
  if (isWebchat) {
    const { error: insertError } = await supabase.from("messages").insert({
      workspace_id: workspaceId,
      conversation_id: conversationId,
      direction: "out",
      type: "text",
      body,
      status: "sent",
      sender_user_id: senderUserId ?? null,
    });
    if (insertError) {
      return { ok: false, error: insertError.message };
    }
    await supabase
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversationId);
    return { ok: true };
  }

  // SEC-10: Block outbound to opted-out contacts
  if (!ctx.optIn) {
    return {
      ok: false,
      error: "OPT_OUT: contact has opted out of messages",
    };
  }

  // 2. App-level 24h window guard (DB trigger is the final enforcer)
  if (
    ctx.windowExpiresAt !== null &&
    new Date() > new Date(ctx.windowExpiresAt) &&
    !overrideAdmin
  ) {
    return { ok: false, error: "WINDOW_EXPIRED" };
  }

  // 3. Channel-branched send
  let wamid: string | undefined;

  if (isMeta) {
    // ── Meta (Facebook Messenger / Instagram DM) ─────────────────────────
    const recipientId = ctx.externalId;
    if (!recipientId) {
      return { ok: false, error: "META_NO_EXTERNAL_ID" };
    }

    const integration = await getMetaIntegration(workspaceId);
    if (!integration) {
      return { ok: false, error: "META_INTEGRATION_NOT_FOUND" };
    }

    const realSend = Boolean(
      integration.pageAccessToken &&
        integration.pageAccessToken !== "placeholder",
    );

    if (realSend) {
      try {
        const result = await sendMetaText({
          pageId: integration.pageId,
          pageAccessToken: integration.pageAccessToken,
          recipientId,
          text: body,
          channel: ctx.channel as "facebook" | "instagram",
        });
        wamid = result.mids[0] ?? undefined;
      } catch (sendErr) {
        const errMsg =
          sendErr instanceof Error ? sendErr.message : String(sendErr);
        console.error("[dispatch] Meta sendText error:", errMsg);

        // Token expired/revoked → flag for reconnection banner
        if (isAuthError(sendErr)) {
          await flagMetaReconnectRequired(workspaceId).catch(() => {});
        }

        // Persist failed message for audit
        await supabase.from("messages").insert({
          workspace_id: workspaceId,
          conversation_id: conversationId,
          direction: "out",
          type: "text",
          body,
          status: "failed",
          sender_user_id: senderUserId ?? null,
          meta: { error: errMsg, override_admin: overrideAdmin || undefined },
        });

        return { ok: false, error: errMsg };
      }
    }

    // Persist outbound message
    const { error: insertError } = await supabase.from("messages").insert({
      workspace_id: workspaceId,
      conversation_id: conversationId,
      direction: "out",
      type: "text",
      body,
      wamid: wamid ?? null,
      status: realSend ? "sent" : "queued",
      sender_user_id: senderUserId ?? null,
      meta: {
        dev_mode: realSend ? undefined : true,
        override_admin: overrideAdmin || undefined,
      },
    });

    if (insertError) {
      console.error("[dispatch] message insert error:", insertError.message);
      return { ok: false, error: insertError.message };
    }
  } else {
    // ── WhatsApp (YCloud) ────────────────────────────────────────────────
    const toPhone = ctx.phone;
    if (!toPhone) {
      return { ok: false, error: "WHATSAPP_NO_PHONE" };
    }

    const { apiKey, fromPhone } = await loadYCloudIntegration(
      workspaceId,
      supabase,
    );

    let ycloudId: string | undefined;
    const realSend = Boolean(apiKey && apiKey !== "placeholder");

    if (realSend) {
      try {
        const sent = await sendText({
          apiKey,
          from: fromPhone,
          to: toPhone,
          body,
        });
        wamid = sent.wamid || undefined;
        ycloudId = sent.id || undefined;
      } catch (sendErr) {
        const errMsg =
          sendErr instanceof Error ? sendErr.message : String(sendErr);
        console.error("[dispatch] YCloud sendText error:", errMsg);

        // Persist failed message for audit
        await supabase.from("messages").insert({
          workspace_id: workspaceId,
          conversation_id: conversationId,
          direction: "out",
          type: "text",
          body,
          status: "failed",
          sender_user_id: senderUserId ?? null,
          meta: { error: errMsg, override_admin: overrideAdmin || undefined },
        });

        return { ok: false, error: errMsg };
      }
    }

    // 5. Persist outbound message
    // The DB trigger trg_messages_24h_window fires here — if override_admin is set
    // and window is expired, the trigger logs WINDOW_OVERRIDE and allows the insert.
    const { error: insertError } = await supabase.from("messages").insert({
      workspace_id: workspaceId,
      conversation_id: conversationId,
      direction: "out",
      type: "text",
      body,
      wamid: wamid ?? null,
      // A real YCloud send is 'sent'; only a placeholder key stays a dev no-op.
      status: realSend ? "sent" : "queued",
      sender_user_id: senderUserId ?? null,
      meta: {
        dev_mode: realSend ? undefined : true,
        ycloud_id: ycloudId,
        override_admin: overrideAdmin || undefined,
      },
    });

    if (insertError) {
      // Surface DB trigger errors (WINDOW_EXPIRED raised by trigger)
      console.error("[dispatch] message insert error:", insertError.message);
      return { ok: false, error: insertError.message };
    }
  }

  // 6. Refresh conversation last_message_at
  await supabase
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversationId);

  return { ok: true, wamid };
}

// ──────────────────────────────────────────────────────────────────────────────
// dispatchImage — sends an image message (WhatsApp/YCloud only)
// ──────────────────────────────────────────────────────────────────────────────
export interface DispatchImageParams {
  workspaceId: string;
  conversationId: string;
  imageUrl: string;
  caption?: string;
  senderUserId?: string;
}

export async function dispatchImage(
  params: DispatchImageParams,
): Promise<DispatchResult> {
  const { workspaceId, conversationId, imageUrl, caption, senderUserId } = params;
  const supabase = svc();

  const ctx = await loadSendContext(conversationId, supabase);

  // Images are only supported on WhatsApp here; Meta channels fall back to text elsewhere.
  if (ctx.channel !== "whatsapp") {
    return { ok: false, error: "IMAGE_UNSUPPORTED_CHANNEL" };
  }
  if (!ctx.optIn) {
    return { ok: false, error: "OPT_OUT: contact has opted out of messages" };
  }
  if (
    ctx.windowExpiresAt !== null &&
    new Date() > new Date(ctx.windowExpiresAt)
  ) {
    return { ok: false, error: "WINDOW_EXPIRED" };
  }
  if (!ctx.phone) {
    return { ok: false, error: "WHATSAPP_NO_PHONE" };
  }

  const { apiKey, fromPhone } = await loadYCloudIntegration(workspaceId, supabase);
  const realSend = Boolean(apiKey && apiKey !== "placeholder");

  let wamid: string | undefined;
  if (realSend) {
    try {
      const sent = await sendImage({
        apiKey,
        from: fromPhone,
        to: ctx.phone,
        link: imageUrl,
        caption,
      });
      wamid = sent.wamid || undefined;
    } catch (sendErr) {
      const errMsg = sendErr instanceof Error ? sendErr.message : String(sendErr);
      console.error("[dispatch] YCloud sendImage error:", errMsg);
      return { ok: false, error: errMsg };
    }
  }

  const { error: insertError } = await supabase.from("messages").insert({
    workspace_id: workspaceId,
    conversation_id: conversationId,
    direction: "out",
    type: "image",
    body: caption ?? null,
    wamid: wamid ?? null,
    status: realSend ? "sent" : "queued",
    sender_user_id: senderUserId ?? null,
    meta: { media_url: imageUrl, dev_mode: realSend ? undefined : true },
  });

  if (insertError) {
    console.error("[dispatch] image insert error:", insertError.message);
    return { ok: false, error: insertError.message };
  }

  await supabase
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversationId);

  return { ok: true, wamid };
}

// ──────────────────────────────────────────────────────────────────────────────
// dispatchTemplate — sends an approved template (bypasses 24h window)
// ──────────────────────────────────────────────────────────────────────────────
export async function dispatchTemplate(
  params: DispatchTemplateParams,
): Promise<DispatchResult> {
  const {
    workspaceId,
    conversationId,
    templateName,
    templateLanguage = "es",
    components,
    senderUserId,
  } = params;

  const supabase = svc();

  // 1. Load send context
  const ctx = await loadSendContext(conversationId, supabase);

  // Templates are WhatsApp-only — Meta doesn't support them.
  if (ctx.channel !== "whatsapp") {
    return {
      ok: false,
      error: "TEMPLATES_UNSUPPORTED",
    };
  }

  const toPhone = ctx.phone;
  if (!toPhone) {
    return { ok: false, error: "WHATSAPP_NO_PHONE" };
  }

  // SEC-10: Block outbound to opted-out contacts
  if (!ctx.optIn) {
    return {
      ok: false,
      error: "OPT_OUT: contact has opted out of WhatsApp messages",
    };
  }

  // 2. Load YCloud credentials
  const { apiKey, fromPhone } = await loadYCloudIntegration(
    workspaceId,
    supabase,
  );

  // 3. Send template via YCloud
  let wamid: string | undefined;

  if (apiKey && apiKey !== "placeholder") {
    try {
      const sent = await sendTemplate({
        apiKey,
        from: fromPhone,
        to: toPhone,
        templateName,
        language: templateLanguage,
        components,
      });
      wamid = sent.wamid;
    } catch (sendErr) {
      const errMsg =
        sendErr instanceof Error ? sendErr.message : String(sendErr);
      console.error("[dispatch] YCloud sendTemplate error:", errMsg);

      await supabase.from("messages").insert({
        workspace_id: workspaceId,
        conversation_id: conversationId,
        direction: "out",
        type: "template",
        body: templateName,
        status: "failed",
        sender_user_id: senderUserId ?? null,
        meta: { error: errMsg, template_name: templateName },
      });

      return { ok: false, error: errMsg };
    }
  }

  // 4. Persist template message — type='template' bypasses DB trigger
  const { error: insertError } = await supabase.from("messages").insert({
    workspace_id: workspaceId,
    conversation_id: conversationId,
    direction: "out",
    type: "template",
    body: templateName,
    wamid: wamid ?? null,
    // Templates start 'queued'; the status webhook advances them (sent/delivered/read).
    status: "queued",
    sender_user_id: senderUserId ?? null,
    meta: {
      template_name: templateName,
      template_language: templateLanguage,
      dev_mode: !wamid || undefined,
    },
  });

  if (insertError) {
    console.error("[dispatch] template insert error:", insertError.message);
    return { ok: false, error: insertError.message };
  }

  // 5. Refresh conversation last_message_at
  await supabase
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversationId);

  return { ok: true, wamid };
}
