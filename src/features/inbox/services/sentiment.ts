// sentiment.ts — cheap, deterministic negative-sentiment detection on inbound
// text. Keyword/heuristic based (no extra LLM call). Used to escalate an upset
// customer to a human and alert the owner before it turns into a bad review.

const STRONG_NEGATIVE = [
  "estafa",
  "estafador",
  "estafadores",
  "ladron",
  "ladrón",
  "ladrones",
  "denuncia",
  "denunciar",
  "abogado",
  "vergüenza",
  "verguenza",
  "verguenza",
  "pésimo",
  "pesimo",
  "horrible",
  "asco",
  "basura",
  "no sirve",
  "no funciona nada",
  "una porquería",
  "una porqueria",
  "indignante",
  "inaceptable",
  "nunca más",
  "nunca mas",
  "me robaron",
  "reclamo",
  "queja formal",
  "defensa del consumidor",
];

/**
 * Returns true when the text shows strong dissatisfaction/anger. Conservative on
 * purpose — meant to catch clear cases (a false positive just pings the owner).
 * Also flags ALL-CAPS shouting combined with any mild-negative word.
 */
export function detectNegativeSentiment(text: string): boolean {
  const t = text.toLowerCase();

  if (STRONG_NEGATIVE.some((w) => t.includes(w))) return true;

  // Shouting (mostly caps, long enough) + a complaint marker.
  const letters = text.replace(/[^a-zA-ZáéíóúñÁÉÍÓÚÑ]/g, "");
  const caps = text.replace(/[^A-ZÁÉÍÓÚÑ]/g, "");
  const isShouting = letters.length >= 12 && caps.length / letters.length > 0.7;
  if (isShouting && /(malo|mal|nunca|nada|espero|cansad|harto|espant)/i.test(t)) {
    return true;
  }

  return false;
}
