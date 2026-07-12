import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Meta (Facebook Messenger / Instagram DM) webhook parsing + verification.
 * Pure module — no Supabase imports — mirroring ycloud-webhook-handler.ts.
 *
 * Payload envelope (both channels):
 *   { "object": "page" | "instagram",
 *     "entry": [ { "id": "<page_id|ig_account_id>", "time": ms,
 *                  "messaging": [ { sender, recipient, timestamp, message|delivery|read|postback } ] } ] }
 */

/**
 * Verifies the `X-Hub-Signature-256` header: "sha256=<hmacSha256Hex>" where the
 * HMAC is computed over the RAW request body with the (single, app-level)
 * META_APP_SECRET. Meta sends no timestamp, so there is no anti-replay window —
 * replays are harmless because inbound messages dedup on `mid`.
 */
export function verifyMetaSignature(
  rawBody: string,
  header: string | null,
  appSecret: string,
): boolean {
  try {
    if (!header || !appSecret) return false;

    const match = header.match(/^sha256=([0-9a-f]+)$/i);
    if (!match) return false;
    const receivedSig = match[1];

    const expectedHex = createHmac("sha256", appSecret)
      .update(rawBody)
      .digest("hex");

    // Constant-time comparison (pad to equal length — mismatched lengths leak
    // info, so we pad before comparing; same technique as verifyYCloudSignature)
    const a = Buffer.from(expectedHex.padEnd(receivedSig.length, "0"), "utf8");
    const b = Buffer.from(receivedSig.padEnd(expectedHex.length, "0"), "utf8");

    const len = Math.max(a.length, b.length);
    const aBuf = Buffer.alloc(len);
    const bBuf = Buffer.alloc(len);
    a.copy(aBuf);
    b.copy(bBuf);

    return (
      timingSafeEqual(aBuf, bBuf) && expectedHex.length === receivedSig.length
    );
  } catch {
    return false;
  }
}

/** One normalized inbound Meta message (Messenger or Instagram DM). */
export interface MetaInboundEvent {
  /** PSID (facebook) or IGSID (instagram) of the customer */
  senderId: string;
  /** page_id or ig_account_id that received the message */
  recipientId: string;
  /** Meta message id — dedup key (stored in messages.wamid) */
  mid: string;
  /** Clamped to the DB message_type enum */
  type: string;
  /** Text content, attachment placeholder, or postback title */
  text: string | null;
  /** Pre-signed CDN download URL for the first attachment, if any */
  mediaUrl: string | null;
  /** Event timestamp in epoch ms */
  timestamp: number;
}

/** All actionable events extracted from one webhook `entry`. */
export interface MetaEntryEvents {
  inbound: MetaInboundEvent[];
  /** mids reported delivered (message_deliveries) */
  deliveredMids: string[];
  /**
   * Watermark-based status events (Meta reports timestamps, not per-message
   * receipts): every outbound message to `senderId` created before `watermark`
   * reached `status`.
   */
  statusEvents: {
    senderId: string;
    watermark: number;
    status: "delivered" | "read";
  }[];
}

/** Valid public.message_type enum values — the DB rejects anything else. */
const MESSAGE_TYPE_ENUM = new Set([
  "text",
  "audio",
  "image",
  "document",
  "video",
  "sticker",
  "location",
  "template",
  "system",
]);

/**
 * Maps a Meta attachment type to the DB message_type enum.
 * Meta types: image | video | audio | file | share | story_mention | reel | ...
 */
function attachmentToMessageType(attachmentType: string): string {
  if (attachmentType === "file") return "document";
  if (attachmentType === "story_mention") return "image";
  return MESSAGE_TYPE_ENUM.has(attachmentType) ? attachmentType : "text";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

/**
 * Parses one webhook `entry` into normalized events. Never throws — malformed
 * events are skipped so one bad event can't take down the whole batch (Meta
 * batches many events per POST and disables webhooks that fail persistently).
 *
 * Skipped on purpose:
 * - `message.is_echo` — the page's own sends (our API sends would duplicate;
 *   Business-Suite replies not appearing in the inbox is a documented v1 limit).
 * - `message.is_deleted` / `standby[]` (handover protocol) — not supported.
 */
export function parseMetaEntry(entry: unknown): MetaEntryEvents {
  const result: MetaEntryEvents = {
    inbound: [],
    deliveredMids: [],
    statusEvents: [],
  };

  const entryObj = asRecord(entry);
  if (!entryObj || !Array.isArray(entryObj.messaging)) return result;

  for (const rawEvent of entryObj.messaging) {
    try {
      const event = asRecord(rawEvent);
      if (!event) continue;

      const senderId = asString(asRecord(event.sender)?.id);
      const recipientId = asString(asRecord(event.recipient)?.id);
      const timestamp =
        typeof event.timestamp === "number" ? event.timestamp : Date.now();

      // ── Delivery receipts ────────────────────────────────────────────────
      const delivery = asRecord(event.delivery);
      if (delivery) {
        if (Array.isArray(delivery.mids)) {
          for (const mid of delivery.mids) {
            if (typeof mid === "string" && mid) result.deliveredMids.push(mid);
          }
        }
        // Watermark fallback covers deliveries that arrive without mids.
        if (senderId && typeof delivery.watermark === "number") {
          result.statusEvents.push({
            senderId,
            watermark: delivery.watermark,
            status: "delivered",
          });
        }
        continue;
      }

      // ── Read receipts ────────────────────────────────────────────────────
      const read = asRecord(event.read);
      if (read) {
        if (senderId && typeof read.watermark === "number") {
          result.statusEvents.push({
            senderId,
            watermark: read.watermark,
            status: "read",
          });
        }
        continue;
      }

      if (!senderId || !recipientId) continue;

      // ── Postbacks (button taps) → synthetic text ─────────────────────────
      const postback = asRecord(event.postback);
      if (postback) {
        const text =
          asString(postback.title) ?? asString(postback.payload) ?? null;
        if (!text) continue;
        result.inbound.push({
          senderId,
          recipientId,
          // Postbacks may carry no mid (notably on Instagram) — synthesize a
          // stable-enough dedup key from sender + timestamp.
          mid: asString(postback.mid) ?? `pb_${senderId}_${timestamp}`,
          type: "text",
          text,
          mediaUrl: null,
          timestamp,
        });
        continue;
      }

      // ── Messages ─────────────────────────────────────────────────────────
      const message = asRecord(event.message);
      if (!message) continue;
      if (message.is_echo === true || message.is_deleted === true) continue;

      const mid = asString(message.mid);
      if (!mid) continue;

      let type = "text";
      let text = asString(message.text);
      let mediaUrl: string | null = null;

      const attachments = Array.isArray(message.attachments)
        ? message.attachments
        : [];
      const firstAttachment = asRecord(attachments[0]);

      if (firstAttachment) {
        const attachmentType = asString(firstAttachment.type) ?? "unknown";
        const payload = asRecord(firstAttachment.payload);
        const url = asString(payload?.url);

        if (attachmentType === "share") {
          // Shared link/post — keep it as text with the URL visible.
          text = text ?? (url ? `[Enlace compartido] ${url}` : "[Multimedia]");
        } else {
          type = attachmentToMessageType(attachmentType);
          mediaUrl = url;
          if (attachmentType === "story_mention") {
            text = text ?? "[Mención en historia]";
          } else if (!text) {
            text = "[Multimedia]";
          }
        }
      }

      // IG story replies arrive as text with a reply_to.story reference.
      const replyToStory = asRecord(asRecord(message.reply_to)?.story);
      if (replyToStory && text) {
        text = `[Respuesta a historia] ${text}`;
      }

      if (!text && !mediaUrl) continue; // nothing actionable (e.g. reactions)

      result.inbound.push({
        senderId,
        recipientId,
        mid,
        type,
        text: text ?? "[Multimedia]",
        mediaUrl,
        timestamp,
      });
    } catch {
      // Skip malformed event, keep processing the rest of the batch.
      continue;
    }
  }

  return result;
}
