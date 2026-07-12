import { type NextRequest, NextResponse, after } from "next/server";
import { createClient as createSbClient } from "@supabase/supabase-js";
import {
  verifyMetaSignature,
  parseMetaEntry,
  type MetaInboundEvent,
} from "@/features/inbox/services/meta-webhook-handler";
import {
  getMetaIntegrationByEntryId,
  enrichMetaContactProfile,
  type MetaIntegration,
} from "@/features/inbox/services/meta-integration";
import { processInbound } from "@/features/inbox/services/normalizer";
import {
  applyMessageStatusUpdate,
  markConversationOutboundBeforeWatermark,
} from "@/features/inbox/services/status-updates";
import { checkRateLimits } from "@/features/inbox/services/cost-tracker";
import {
  upsertBatch,
  processNextBatch,
} from "@/features/inbox/services/buffer";
import {
  downloadAndStoreMedia,
  patchMessageMedia,
} from "@/features/inbox/services/media-handler";
import {
  transcribeAudio,
  describeImage,
} from "@/features/inbox/services/media-understanding";

// Keep the function alive long enough for the best-effort fast path below
// (sleep through the buffer window + AI generation). The cron is the fallback.
export const maxDuration = 60;

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * Meta webhook verification handshake (configured once, app-level, in the
 * Meta dashboard). Must echo hub.challenge as PLAIN TEXT on success.
 */
export function GET(request: NextRequest): NextResponse {
  const params = request.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (
    mode === "subscribe" &&
    token &&
    process.env.META_VERIFY_TOKEN &&
    token === process.env.META_VERIFY_TOKEN &&
    challenge
  ) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

/** Resolves the conversation for a Meta contact (by channel + external id). */
async function findConversation(
  supabase: ReturnType<typeof svc>,
  workspaceId: string,
  channel: "facebook" | "instagram",
  externalId: string,
): Promise<string | null> {
  const { data: contact } = await supabase
    .from("contacts")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("channel", channel)
    .eq("external_id", externalId)
    .maybeSingle();
  if (!contact) return null;

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("contact_id", contact.id)
    .eq("channel", channel)
    .maybeSingle();
  return conversation?.id ?? null;
}

interface InboundOutcome {
  /** Deferred media download + AI understanding job */
  mediaJob: (() => Promise<void>) | null;
  /** Deferred profile-name/avatar enrichment job */
  enrichJob: (() => Promise<void>) | null;
  /** Silence window when the message was buffered for an AI reply */
  bufferedSilenceMs: number | null;
}

async function handleInboundEvent(
  supabase: ReturnType<typeof svc>,
  integration: MetaIntegration,
  channel: "facebook" | "instagram",
  event: MetaInboundEvent,
): Promise<InboundOutcome> {
  const outcome: InboundOutcome = {
    mediaJob: null,
    enrichJob: null,
    bufferedSilenceMs: null,
  };
  const workspaceId = integration.workspaceId;

  const { contact, conversation, message } = await processInbound(workspaceId, {
    channel,
    identity: { kind: "external", externalId: event.senderId },
    // Meta messaging events carry no display name — enrichment fills it in.
    profileName: null,
    type: event.type,
    text: event.text,
    providerMessageId: event.mid,
  });

  // Duplicate mid — already processed (also our replay defense)
  if (!message) return outcome;

  if (!contact.name || !contact.avatar_url) {
    outcome.enrichJob = () =>
      enrichMetaContactProfile({
        workspaceId,
        contactId: contact.id,
        channel,
        externalId: event.senderId,
      });
  }

  // Media handling (download + AI understanding) is deferred so the webhook
  // stays fast. Meta CDN URLs are pre-signed and EXPIRE — the after() job runs
  // promptly. transcript/description land in meta before the batch flushes.
  const mediaUrl = event.type !== "text" ? event.mediaUrl : null;
  if (mediaUrl) {
    const messageId = message.id;
    const conversationId = conversation.id;
    const messageType = event.type;
    const caption =
      event.text && event.text !== "[Multimedia]" ? event.text : undefined;
    outcome.mediaJob = async () => {
      try {
        const mediaMeta = await downloadAndStoreMedia({
          link: mediaUrl,
          source: "meta",
          workspaceId,
          conversationId,
          caption,
        });
        if (!mediaMeta) return;

        // Translate voice/image to text so the agent understands them.
        if (messageType === "audio") {
          const transcript = await transcribeAudio({
            storagePath: mediaMeta.storage_path,
            mimeType: mediaMeta.mime_type,
            workspaceId,
          });
          if (transcript) mediaMeta.transcript = transcript;
        } else if (messageType === "image") {
          const description = await describeImage({
            storagePath: mediaMeta.storage_path,
            mimeType: mediaMeta.mime_type,
            caption: mediaMeta.caption,
            workspaceId,
          });
          if (description) mediaMeta.description = description;
        }

        await patchMessageMedia(workspaceId, messageId, mediaMeta);
      } catch (mediaErr) {
        console.error(
          "[meta-webhook] media handling failed:",
          mediaErr instanceof Error ? mediaErr.message : "unknown",
        );
      }
    };
  }

  // AI is toggled off — still fetch the media so the human agent sees it.
  if (!conversation.ai_enabled) return outcome;

  // Rate-limit check — avoid buffering rate-limited contacts
  const { allowed, reason } = await checkRateLimits(workspaceId, contact.id);
  if (!allowed) {
    // SEC-09: log only non-sensitive fields (no credentials or contact PII)
    console.warn("[meta-webhook] rate limited:", reason ?? "unknown reason");
    return outcome;
  }

  // Buffer the message — AI reply is deferred to the fast path / cron.
  // Same per-workspace silence config keys as the YCloud integration.
  const bufferSeconds = Number(
    (integration.config as { buffer_silence_seconds?: number })
      .buffer_silence_seconds,
  );
  const silenceMs =
    Number.isFinite(bufferSeconds) && bufferSeconds >= 3
      ? Math.min(bufferSeconds, 120) * 1000
      : undefined;

  await upsertBatch({
    workspaceId,
    conversationId: conversation.id,
    messageId: message.id,
    silenceMs,
  });

  outcome.bufferedSilenceMs = silenceMs ?? 30_000;
  return outcome;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const rawBody = await request.text();

    // CRITICAL: verify the app-level signature over the RAW body BEFORE any
    // parsing or DB access. Meta sends no timestamp — replays are neutralized
    // by the per-message mid dedup in processInbound.
    const sigHeader = request.headers.get("x-hub-signature-256");
    const appSecret = process.env.META_APP_SECRET ?? "";
    if (!verifyMetaSignature(rawBody, sigHeader, appSecret)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const bodyObj =
      typeof body === "object" && body !== null
        ? (body as Record<string, unknown>)
        : null;
    const object = bodyObj?.object;
    if (object !== "page" && object !== "instagram") {
      return NextResponse.json({ received: true });
    }
    const channel = object === "instagram" ? "instagram" : "facebook";

    const entries = Array.isArray(bodyObj?.entry) ? bodyObj.entry : [];
    const supabase = svc();

    // One POST can batch MANY entries × events. Each entry is isolated in its
    // own try/catch — Meta backs off (and eventually disables) subscriptions
    // that fail persistently, so we always answer 200 fast.
    const deferredJobs: Array<() => Promise<void>> = [];
    let maxSilenceMs: number | null = null;
    let bufferedCount = 0;

    for (const entry of entries) {
      try {
        const entryObj =
          typeof entry === "object" && entry !== null
            ? (entry as Record<string, unknown>)
            : null;
        const entryId = typeof entryObj?.id === "string" ? entryObj.id : null;
        if (!entryId) continue;

        // entry.id is the page_id (Messenger) or ig_account_id (Instagram)
        const integration = await getMetaIntegrationByEntryId(entryId);
        if (!integration) continue; // page not connected to any workspace

        const events = parseMetaEntry(entry);

        // Status updates first — cheap, no side effects on the AI pipeline.
        for (const mid of events.deliveredMids) {
          await applyMessageStatusUpdate(supabase, mid, "delivered");
        }
        for (const statusEvent of events.statusEvents) {
          const conversationId = await findConversation(
            supabase,
            integration.workspaceId,
            channel,
            statusEvent.senderId,
          );
          if (conversationId) {
            await markConversationOutboundBeforeWatermark(
              supabase,
              conversationId,
              statusEvent.watermark,
              statusEvent.status,
            );
          }
        }

        for (const inbound of events.inbound) {
          const outcome = await handleInboundEvent(
            supabase,
            integration,
            channel,
            inbound,
          );
          if (outcome.mediaJob) deferredJobs.push(outcome.mediaJob);
          if (outcome.enrichJob) deferredJobs.push(outcome.enrichJob);
          if (outcome.bufferedSilenceMs !== null) {
            bufferedCount++;
            maxSilenceMs = Math.max(
              maxSilenceMs ?? 0,
              outcome.bufferedSilenceMs,
            );
          }
        }
      } catch (entryErr) {
        // SEC-09: never log full error objects/payloads
        console.error(
          "[meta-webhook] entry processing failed:",
          entryErr instanceof Error ? entryErr.message : "unknown",
        );
      }
    }

    // Best-effort fast path (mirrors the YCloud webhook): media + profile
    // enrichment first, then wait out the buffer window and drain the batches.
    // If the function is recycled early, the every-minute cron picks them up.
    if (deferredJobs.length > 0 || bufferedCount > 0) {
      const silenceMs = maxSilenceMs;
      const drains = Math.min(bufferedCount, 5);
      after(async () => {
        for (const job of deferredJobs) {
          await job();
        }
        if (silenceMs === null) return;
        await new Promise((resolve) => setTimeout(resolve, silenceMs + 500));
        try {
          for (let i = 0; i < drains; i++) {
            const result = await processNextBatch();
            if (!result.processed) break;
          }
        } catch (e) {
          console.error(
            "[meta-webhook] fast-path process error:",
            e instanceof Error ? e.message : "unknown",
          );
        }
      });
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    // SEC-09: never log full error objects — they may contain credentials or raw payloads
    console.error(
      "[meta-webhook] unhandled error:",
      err instanceof Error ? err.message : "unknown error",
    );
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
