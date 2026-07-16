// tts.ts — #3 Voice replies. Turns text into a WhatsApp voice note.
//
// Provider: OpenAI Audio Speech API (/v1/audio/speech). We request the `opus`
// format, which returns an Ogg/Opus stream — exactly what WhatsApp expects for a
// voice note, so there's NO ffmpeg/transcoding step. Needs OPENAI_API_KEY (a
// direct OpenAI key; OpenRouter does not proxy TTS).

const OPENAI_TTS_URL = "https://api.openai.com/v1/audio/speech";

export interface SynthesizedSpeech {
  bytes: Uint8Array;
  mime: string;
  ext: string;
}

/** Whether voice replies can run at all (key configured). */
export function isTtsConfigured(): boolean {
  const key = process.env.OPENAI_API_KEY ?? "";
  return Boolean(key) && key !== "placeholder";
}

/**
 * Synthesizes `text` to an Ogg/Opus voice note. Throws on missing key or a
 * non-2xx OpenAI response. `voice` defaults to a warm, neutral Spanish-friendly
 * voice; `model` defaults to the low-cost tts model.
 */
export async function synthesizeSpeech(
  text: string,
  opts: { voice?: string; model?: string } = {},
): Promise<SynthesizedSpeech> {
  if (!isTtsConfigured()) {
    throw new Error("OPENAI_API_KEY no configurada — voz deshabilitada");
  }

  // WhatsApp voice notes cap around a few minutes; keep it short and cheap.
  const input = text.slice(0, 2000);

  const res = await fetch(OPENAI_TTS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model ?? "gpt-4o-mini-tts",
      voice: opts.voice ?? "alloy",
      input,
      response_format: "opus",
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    let detail = "";
    try {
      detail = JSON.stringify(await res.json());
    } catch {
      /* ignore */
    }
    throw new Error(`OpenAI TTS error ${res.status} ${detail}`);
  }

  const buf = new Uint8Array(await res.arrayBuffer());
  return { bytes: buf, mime: "audio/ogg", ext: "ogg" };
}
