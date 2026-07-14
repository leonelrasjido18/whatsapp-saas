// Public webchat endpoint — the embeddable widget posts visitor messages here.
// Resolves the workspace from the public key, routes the message into the same
// processInbound → buffer → agent pipeline used by WhatsApp/Meta, and returns
// the conversation id. Replies are fetched via the sibling /messages route.
//
// Anonymous by design (no session). CORS is locked to the workspace's configured
// allowed_origin when set. Rate-limited per session to deter abuse.

import { type NextRequest, NextResponse, after } from "next/server";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { processInbound } from "@/features/inbox/services/normalizer";
import { upsertBatch, processNextBatch } from "@/features/inbox/services/buffer";
import { checkRateLimits } from "@/features/inbox/services/cost-tracker";

export const maxDuration = 60;

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function corsHeaders(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(req.headers.get("origin")),
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ publicKey: string }> },
) {
  const { publicKey } = await params;
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);

  const supabase = svc();

  const { data: settings } = await supabase
    .from("webchat_settings")
    .select("workspace_id, enabled, allowed_origin")
    .eq("public_key", publicKey)
    .maybeSingle();

  if (!settings || !settings.enabled) {
    return NextResponse.json(
      { error: "Widget no disponible" },
      { status: 404, headers },
    );
  }

  // Origin lock: if configured, reject mismatched origins.
  if (
    settings.allowed_origin &&
    origin &&
    origin !== settings.allowed_origin
  ) {
    return NextResponse.json({ error: "Origen no permitido" }, { status: 403, headers });
  }

  let body: { sessionId?: string; text?: string };
  try {
    body = (await req.json()) as { sessionId?: string; text?: string };
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400, headers });
  }

  const sessionId = (body.sessionId ?? "").trim();
  const text = (body.text ?? "").trim();
  if (!sessionId || !text) {
    return NextResponse.json(
      { error: "Falta sessionId o text" },
      { status: 400, headers },
    );
  }
  if (text.length > 4000) {
    return NextResponse.json({ error: "Mensaje demasiado largo" }, { status: 400, headers });
  }

  const workspaceId = settings.workspace_id as string;

  try {
    const { contact, conversation, message } = await processInbound(workspaceId, {
      channel: "webchat",
      identity: { kind: "external", externalId: `webchat:${sessionId}` },
      profileName: null,
      type: "text",
      text,
      providerMessageId: `webchat:${sessionId}:${Date.now()}`,
    });

    if (!message) {
      return NextResponse.json(
        { conversationId: conversation.id, dedup: true },
        { headers },
      );
    }

    if (!conversation.ai_enabled) {
      return NextResponse.json({ conversationId: conversation.id }, { headers });
    }

    const { allowed } = await checkRateLimits(workspaceId, contact.id);
    if (!allowed) {
      return NextResponse.json(
        { conversationId: conversation.id, rateLimited: true },
        { status: 429, headers },
      );
    }

    // Short buffer for webchat — the visitor is waiting on the page.
    const silenceMs = 4000;
    await upsertBatch({
      workspaceId,
      conversationId: conversation.id,
      messageId: message.id,
      silenceMs,
    });

    after(async () => {
      await new Promise((r) => setTimeout(r, silenceMs + 500));
      try {
        await processNextBatch();
      } catch (e) {
        console.error(
          "[webchat] process error:",
          e instanceof Error ? e.message : "unknown",
        );
      }
    });

    return NextResponse.json({ conversationId: conversation.id }, { headers });
  } catch (err) {
    console.error("[webchat] POST error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Error interno" }, { status: 500, headers });
  }
}
