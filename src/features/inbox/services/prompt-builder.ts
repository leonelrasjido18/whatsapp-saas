/**
 * prompt-builder.ts — canonical assembly of the agent system prompt.
 *
 * Both production (buffer.ts) and the in-UI playground (test-chat) MUST use this
 * so they never drift. Pure string assembly — no DB, no "use server".
 *
 * Order (guardrails go LAST — models obey end-of-prompt instructions most):
 *   now → summary → business info → knowledge base → response style →
 *   prompt base → WhatsApp format note → strict rules/restrictions
 */

export type ResponseStyle = "concise" | "balanced" | "detailed";

export interface PromptGuardrails {
  /** Things the agent must always do. */
  rules?: string[];
  /** Things the agent must never do / say / mention. */
  restrictions?: string[];
}

export interface SystemPromptVars {
  agentName?: string | null;
  businessName?: string | null;
  contactName?: string | null;
}

export interface BuildSystemPromptParts {
  nowContext: string;
  bizContext: string;
  promptBase: string;
  summary?: string | null;
  kbContext?: string | null;
  responseStyle?: ResponseStyle | null;
  guardrails?: PromptGuardrails | null;
  vars?: SystemPromptVars;
  /** Per-contact long-term memory block (past purchases, tier, etc.). */
  customerMemory?: string | null;
  /** Business opening hours string, e.g. "Lun a Vie de 9 a 18". */
  businessHours?: string | null;
}

// "balanced" is the natural default → no block, keeps the prompt lean.
const STYLE_INSTRUCTIONS: Record<ResponseStyle, string> = {
  concise:
    "Responde en UNA sola frase corta siempre que puedas. Máximo 25 palabras. Sin rodeos ni relleno.",
  balanced: "",
  detailed:
    "Responde de forma completa y detallada: explica con el contexto necesario cuando ayude a la persona.",
};

// Global brevity guardrail. WhatsApp is a fast chat, not email — long, multi-
// paragraph replies with bullet lists feel robotic and hurt conversions. This is
// injected for EVERY style except "detailed" (the explicit opt-out for when a
// business really wants long answers), so all agents are short by default without
// any per-workspace configuration.
const BREVITY_NOTE =
  "## Brevedad (MUY IMPORTANTE)\n" +
  "Es un chat de WhatsApp, no un correo. Responde MUY corto: 1 o 2 frases, " +
  "máximo 40 palabras en total. Una sola idea por mensaje.\n" +
  "PROHIBIDO: listas con viñetas o números (salvo que el cliente pida explícitamente " +
  "una lista), párrafos largos, enumerar varias opciones/sugerencias, repetir lo ya " +
  "dicho, y saludos o despedidas de relleno. Si necesitas más datos, hacé UNA sola " +
  "pregunta corta. Habla natural, como una persona real que escribe rápido.";

const WHATSAPP_FORMAT_NOTE =
  "## Formato\n" +
  'Escribes para WhatsApp. Usa *negrita* (un solo asterisco), _cursiva_ y listas con "- ". ' +
  "NO uses Markdown: nada de **, ##, encabezados, ni tablas.";

// Voice notes are auto-transcribed and images auto-described before they reach
// the agent, so the text it reads already contains their content. Without this
// the model falls back to the generic "no puedo escuchar audios" chatbot
// disclaimer when a customer's (transcribed) message asks about voice/audio.
const MEDIA_CAPABILITY_NOTE =
  "## Notas de voz e imágenes\n" +
  "Las notas de voz del cliente se transcriben automáticamente a texto y las " +
  "imágenes se describen automáticamente: lo que lees ya incluye su contenido. " +
  "Respóndelo con normalidad. NUNCA digas que no puedes escuchar audios/notas " +
  "de voz ni ver imágenes — sí puedes, ya te llegan convertidos a texto.";

export function substituteVars(text: string, vars?: SystemPromptVars): string {
  if (!vars) return text;
  return text
    .replaceAll("{{agent_name}}", vars.agentName ?? "")
    .replaceAll("{{business_name}}", vars.businessName ?? "")
    .replaceAll("{{contact.name}}", vars.contactName ?? "");
}

function buildGuardrailsBlock(g: PromptGuardrails | null | undefined): string {
  if (!g) return "";
  const rules = (g.rules ?? []).map((s) => s.trim()).filter(Boolean);
  const restrictions = (g.restrictions ?? [])
    .map((s) => s.trim())
    .filter(Boolean);
  if (rules.length === 0 && restrictions.length === 0) return "";

  const lines = ["=== REGLAS ESTRICTAS (cumple SIEMPRE) ==="];
  if (rules.length > 0) {
    lines.push("Siempre debes:");
    lines.push(...rules.map((r) => `- ${r}`));
  }
  if (restrictions.length > 0) {
    if (rules.length > 0) lines.push("");
    lines.push("NUNCA debes (bajo ninguna circunstancia):");
    lines.push(...restrictions.map((r) => `- ${r}`));
  }
  return lines.join("\n");
}

export function buildSystemPrompt(parts: BuildSystemPromptParts): string {
  const summaryBlock =
    parts.summary && parts.summary.trim()
      ? `## Resumen de la conversación\n${parts.summary.trim()}`
      : "";

  const styleText = parts.responseStyle
    ? STYLE_INSTRUCTIONS[parts.responseStyle]
    : "";
  const styleBlock = styleText ? `## Estilo de respuesta\n${styleText}` : "";

  const base = substituteVars(parts.promptBase, parts.vars);
  const guardrailsBlock = buildGuardrailsBlock(parts.guardrails);

  // Short by default: everyone gets the brevity rule except the explicit
  // "detailed" opt-out. Placed near the very end (before strict rules) because
  // models obey end-of-prompt instructions most.
  const brevityBlock =
    parts.responseStyle === "detailed" ? "" : BREVITY_NOTE;

  const memoryBlock =
    parts.customerMemory && parts.customerMemory.trim()
      ? parts.customerMemory.trim()
      : "";

  const hoursBlock =
    parts.businessHours && parts.businessHours.trim()
      ? "## Horario de atención\n" +
        `El horario de atención es: ${parts.businessHours.trim()}. ` +
        "Podés responder siempre, pero si el cliente escribe fuera de ese horario " +
        "y necesita algo que requiere una persona (un reclamo, algo que no podés " +
        "resolver), avisale con amabilidad que el equipo lo contactará en el horario de atención."
      : "";

  return [
    parts.nowContext,
    summaryBlock,
    parts.bizContext,
    hoursBlock,
    memoryBlock,
    parts.kbContext ?? "",
    styleBlock,
    base,
    WHATSAPP_FORMAT_NOTE,
    MEDIA_CAPABILITY_NOTE,
    brevityBlock,
    guardrailsBlock,
  ]
    .filter(Boolean)
    .join("\n\n");
}
