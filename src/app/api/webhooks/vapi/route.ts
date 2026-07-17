// Vapi webhook — #4 IA telefónica. Vapi (proveedor de voz en vivo) llama acá por
// dos motivos:
//  1. "tool-calls" / "function-call": el asistente necesita ejecutar una tool
//     durante la llamada → la corremos con el MISMO registry que usa WhatsApp.
//  2. "end-of-call-report": la llamada terminó → guardamos la transcripción como
//     una conversación (channel='phone') para que aparezca en el inbox y cuente
//     en analytics/ROI.
//
// Auth: header `x-vapi-secret` debe matchear el secret guardado al sincronizar
// el asistente (ver voice-agent.ts).

import { NextRequest, NextResponse } from "next/server";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { registry } from "@/features/tools";
import { findWorkspaceByAssistantId } from "@/features/voice/services/voice-agent";
import { processInbound } from "@/features/inbox/services/normalizer";

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

interface VapiToolCall {
  id: string;
  function: { name: string; arguments: unknown };
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : null;
}

/**
 * Finds/creates the contact+conversation for a call. Keyed by Vapi's stable
 * `callId` (not Date.now()) so repeated invocations during ONE call — a
 * tool-call fires this on every function execution — dedupe to a single
 * "call started" system message instead of spamming the transcript.
 */
async function resolveConversation(
  workspaceId: string,
  callerPhone: string,
  callId: string,
): Promise<{ conversationId: string; contactId: string }> {
  const { contact, conversation } = await processInbound(workspaceId, {
    channel: "phone",
    identity: { kind: "phone", phone: callerPhone },
    profileName: null,
    type: "system",
    text: "[Llamada telefónica iniciada]",
    providerMessageId: `phone-start:${callId}`,
  });
  return { conversationId: conversation.id, contactId: contact.id };
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const root = asRecord(body);
  const message = asRecord(root?.message);
  if (!message) return NextResponse.json({ received: true });

  const call = asRecord(message.call);
  const assistantId =
    (call?.assistantId as string | undefined) ??
    (asRecord(call?.assistant)?.id as string | undefined);
  if (!assistantId) return NextResponse.json({ received: true });

  const target = await findWorkspaceByAssistantId(assistantId);
  if (!target) return NextResponse.json({ received: true });

  const secretHeader = req.headers.get("x-vapi-secret");
  if (target.webhookSecret && secretHeader !== target.webhookSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const type = message.type as string | undefined;
  const supabase = svc();

  // ── Live tool execution ─────────────────────────────────────────────────
  if (type === "tool-calls" || type === "function-call") {
    const callerPhone =
      (asRecord(call?.customer)?.number as string | undefined) ?? "unknown";
    const callId = (call?.id as string | undefined) ?? `unknown:${assistantId}`;
    let conversationId: string;
    let contactId: string;
    try {
      const resolved = await resolveConversation(
        target.workspaceId,
        callerPhone,
        callId,
      );
      conversationId = resolved.conversationId;
      contactId = resolved.contactId;
    } catch {
      return NextResponse.json({ results: [] });
    }

    const toolCalls: VapiToolCall[] = Array.isArray(message.toolCalls)
      ? (message.toolCalls as VapiToolCall[])
      : message.functionCall
        ? [{ id: "single", function: message.functionCall as VapiToolCall["function"] }]
        : [];

    const results = await Promise.all(
      toolCalls.map(async (tc) => {
        let args: unknown = tc.function.arguments;
        if (typeof args === "string") {
          try {
            args = JSON.parse(args);
          } catch {
            args = {};
          }
        }
        const result = await registry.run(tc.function.name, args, {
          workspaceId: target.workspaceId,
          conversationId,
          contactId,
        });
        return {
          toolCallId: tc.id,
          result: result.ok ? JSON.stringify(result.output) : `Error: ${result.error}`,
        };
      }),
    );

    // Support both the newer ("results") and older ("result") response shapes.
    if (message.functionCall) {
      return NextResponse.json({ result: results[0]?.result ?? "" });
    }
    return NextResponse.json({ results });
  }

  // ── Call ended: log the transcript as a conversation ───────────────────
  if (type === "end-of-call-report") {
    const callerPhone =
      (asRecord(call?.customer)?.number as string | undefined) ?? null;
    const callId = (call?.id as string | undefined) ?? null;
    if (!callerPhone || !callId) return NextResponse.json({ received: true });

    try {
      const { conversationId } = await resolveConversation(
        target.workspaceId,
        callerPhone,
        callId,
      );

      const transcriptMsgs = Array.isArray(message.messages)
        ? (message.messages as Array<{ role?: string; message?: string }>)
        : [];

      const rows = transcriptMsgs
        .filter((m) => m.role === "user" || m.role === "bot" || m.role === "assistant")
        .map((m) => ({
          workspace_id: target.workspaceId,
          conversation_id: conversationId,
          direction: m.role === "user" ? "in" : "out",
          type: "text",
          body: m.message ?? "",
          status: "sent",
          meta: { channel: "phone" },
        }))
        .filter((r) => r.body.trim().length > 0);

      if (rows.length > 0) {
        await supabase.from("messages").insert(rows);
      }
      await supabase
        .from("conversations")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", conversationId);
    } catch (err) {
      console.error("[vapi-webhook] end-of-call logging failed:", err);
    }

    return NextResponse.json({ received: true });
  }

  return NextResponse.json({ received: true });
}
