import { z } from "zod";
import { randomUUID } from "node:crypto";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { Tool } from "../core/tool";
import { synthesizeSpeech, isTtsConfigured } from "@/features/inbox/services/tts";
import { getSignedUrls } from "@/features/commerce/services/product-images";
import { dispatchAudio } from "@/features/inbox/services/dispatch";

// #3 Voice replies. The agent can answer with a spoken WhatsApp voice note.
// Off by default — the owner enables it in the Tools catalog, and it only works
// when OPENAI_API_KEY is configured (TTS provider). Great when the customer
// sends a voice note or explicitly asks for audio.

const MEDIA_BUCKET = "whatsapp-media";

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const schema = z.object({
  text: z
    .string()
    .min(1)
    .max(2000)
    .describe("El texto a convertir en nota de voz. Mantenelo natural y breve."),
});

export const sendVoiceNoteTool: Tool<z.infer<typeof schema>> = {
  name: "send_voice_note",
  description:
    "Responde con una nota de voz de WhatsApp (audio hablado) en vez de texto. Usar cuando el cliente manda un audio, pide que le hablen, o una respuesta hablada suma. Mantené el texto natural y breve.",
  sensitivity: "write",
  schema,
  // Available to the agent only when the TTS provider is configured; the
  // per-workspace on/off is the tool's own toggle in the Tools catalog.
  enabledFor: () => isTtsConfigured(),
  run: async (args, ctx) => {
    try {
      if (!isTtsConfigured()) {
        return {
          ok: true,
          output: {
            sent: false,
            message: "La voz no está configurada. Respondé por texto.",
          },
        };
      }

      const supabase = svc();

      // 1. Text → Ogg/Opus voice note.
      const speech = await synthesizeSpeech(args.text);

      // 2. Upload to storage so YCloud can fetch it by URL.
      const path = `${ctx.workspaceId}/voice/${randomUUID()}.${speech.ext}`;
      const { error: uploadError } = await supabase.storage
        .from(MEDIA_BUCKET)
        .upload(path, speech.bytes, {
          contentType: speech.mime,
          upsert: false,
        });
      if (uploadError) {
        return {
          ok: true,
          output: {
            sent: false,
            message: "No se pudo preparar el audio. Respondé por texto.",
          },
        };
      }

      // 3. Signed URL + send.
      const [url] = await getSignedUrls(supabase, [path], 3600);
      if (!url) {
        return {
          ok: true,
          output: {
            sent: false,
            message: "No se pudo obtener el audio. Respondé por texto.",
          },
        };
      }

      const result = await dispatchAudio({
        workspaceId: ctx.workspaceId,
        conversationId: ctx.conversationId,
        audioUrl: url,
        transcript: args.text,
      });

      if (!result.ok) {
        return {
          ok: true,
          output: {
            sent: false,
            message:
              "No se pudo enviar la nota de voz (ventana de 24h vencida o canal sin soporte). Respondé por texto.",
          },
        };
      }

      return {
        ok: true,
        output: { sent: true, message: "Nota de voz enviada al cliente." },
      };
    } catch (e) {
      return {
        ok: false,
        output: null,
        error: e instanceof Error ? e.message : "error",
      };
    }
  },
};
