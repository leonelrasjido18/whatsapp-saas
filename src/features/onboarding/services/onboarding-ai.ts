// onboarding-ai.ts — #1 AI onboarding. Takes a website URL and/or the text of an
// uploaded file (PDF/Word/Excel already extracted) and asks the LLM to structure
// it into: business info, a product/service catalog, and FAQs. The owner reviews
// the proposal, then "apply" writes it into business_info, products and the KB.
//
// Instagram note: IG actively blocks scrapers, so we key on the website/PDF path
// (reliable). A public IG page URL can still be passed, but may yield little.

import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { createClient as createSbClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchUrlText } from "@/features/inbox/services/url-scraper";
import {
  getWorkspaceModel,
  getOpenRouterApiKey,
} from "@/features/inbox/services/openrouter";
import { createProduct } from "@/features/commerce/services/catalog";
import { ingestDocument } from "@/features/inbox/services/kb-service";

function svc(): SupabaseClient {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export interface ProposedProduct {
  name: string;
  description: string | null;
  price: number | null;
  type: "product" | "service";
}

export interface ProposedFaq {
  question: string;
  answer: string;
}

export interface ProposedBusiness {
  name: string | null;
  description: string | null;
  address: string | null;
  hours: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
}

export interface OnboardingProposal {
  business: ProposedBusiness;
  products: ProposedProduct[];
  faqs: ProposedFaq[];
  /** The raw source text we extracted, so "apply" can keep it in the KB. */
  rawText: string;
}

const MAX_SOURCE_CHARS = 24_000;

const SYSTEM_PROMPT = `Sos un asistente que estructura la información de un negocio a partir del texto de su sitio web, menú o catálogo.
Devolvés EXCLUSIVAMENTE un objeto JSON válido (sin markdown, sin explicaciones) con esta forma:
{
  "business": { "name": string|null, "description": string|null, "address": string|null, "hours": string|null, "phone": string|null, "email": string|null, "website": string|null },
  "products": [ { "name": string, "description": string|null, "price": number|null, "type": "product"|"service" } ],
  "faqs": [ { "question": string, "answer": string } ]
}
Reglas:
- Extraé precios como número sin símbolos ni separadores de miles (ej: 15000). Si no hay precio, usá null.
- "type" es "service" para servicios/turnos y "product" para bienes físicos.
- No inventes datos que no estén en el texto. Si algo no aparece, usá null o lista vacía.
- Generá 3 a 8 FAQs útiles basadas en el contenido (envíos, horarios, formas de pago, etc.) solo si hay información para responderlas.
- Máximo 40 productos.`;

/** Best-effort JSON extraction from an LLM response (strips code fences). */
function parseJsonLoose(text: string): unknown {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    t = t.slice(first, last + 1);
  }
  return JSON.parse(t);
}

function coerceProduct(raw: unknown): ProposedProduct | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const name = typeof o.name === "string" ? o.name.trim() : "";
  if (!name) return null;
  const priceNum =
    typeof o.price === "number"
      ? o.price
      : typeof o.price === "string"
        ? Number(o.price.replace(/[^\d.]/g, ""))
        : NaN;
  return {
    name: name.slice(0, 200),
    description:
      typeof o.description === "string" && o.description.trim()
        ? o.description.trim().slice(0, 1000)
        : null,
    price: Number.isFinite(priceNum) && priceNum >= 0 ? priceNum : null,
    type: o.type === "service" ? "service" : "product",
  };
}

/**
 * Runs extraction over the given sources and returns a reviewable proposal.
 * At least one of `url` / `fileText` must be non-empty.
 */
export async function extractOnboardingProposal(opts: {
  workspaceId: string;
  url?: string | null;
  fileText?: string | null;
}): Promise<OnboardingProposal> {
  const { workspaceId } = opts;

  const pieces: string[] = [];
  if (opts.fileText && opts.fileText.trim()) {
    pieces.push(opts.fileText.trim());
  }
  if (opts.url && opts.url.trim()) {
    try {
      const urlText = await fetchUrlText(opts.url);
      pieces.push(`(Desde ${opts.url})\n${urlText}`);
    } catch (err) {
      // If a URL fails (e.g. Instagram blocking), keep going with whatever else
      // we have; only throw if there's nothing at all.
      if (pieces.length === 0) {
        throw err instanceof Error
          ? err
          : new Error("No se pudo leer la URL");
      }
    }
  }

  const rawText = pieces.join("\n\n---\n\n").slice(0, MAX_SOURCE_CHARS);
  if (rawText.length < 20) {
    throw new Error("No hay suficiente contenido para analizar.");
  }

  const apiKey = await getOpenRouterApiKey(workspaceId);
  if (!apiKey || apiKey === "placeholder") {
    throw new Error(
      "Falta la API key de IA (OpenRouter) para analizar el contenido.",
    );
  }

  const model = await getWorkspaceModel(workspaceId);
  const openrouter = createOpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey,
    headers: {
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
      "X-Title": "Agente WhatsApp",
    },
  });

  const result = await generateText({
    model: openrouter.chat(model),
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Analizá este contenido y devolvé el JSON:\n\n${rawText}`,
      },
    ],
    maxOutputTokens: 4096,
  });

  let parsed: Record<string, unknown>;
  try {
    parsed = parseJsonLoose(result.text) as Record<string, unknown>;
  } catch {
    throw new Error(
      "La IA no devolvió un formato válido. Probá de nuevo o con otra fuente.",
    );
  }

  const businessRaw = (parsed.business as Record<string, unknown>) ?? {};
  const str = (v: unknown) =>
    typeof v === "string" && v.trim() ? v.trim() : null;

  const business: ProposedBusiness = {
    name: str(businessRaw.name),
    description: str(businessRaw.description),
    address: str(businessRaw.address),
    hours: str(businessRaw.hours),
    phone: str(businessRaw.phone),
    email: str(businessRaw.email),
    website: str(businessRaw.website) ?? (opts.url ? opts.url.trim() : null),
  };

  const products = Array.isArray(parsed.products)
    ? parsed.products
        .map(coerceProduct)
        .filter((p): p is ProposedProduct => p !== null)
        .slice(0, 40)
    : [];

  const faqs: ProposedFaq[] = Array.isArray(parsed.faqs)
    ? parsed.faqs
        .map((f) => {
          const o = (f ?? {}) as Record<string, unknown>;
          const question = str(o.question);
          const answer = str(o.answer);
          return question && answer ? { question, answer } : null;
        })
        .filter((f): f is ProposedFaq => f !== null)
        .slice(0, 12)
    : [];

  return { business, products, faqs, rawText };
}

export interface ApplyOptions {
  applyBusiness: boolean;
  applyProducts: boolean;
  applyFaqs: boolean;
}

export interface ApplyResult {
  productsCreated: number;
  faqsIngested: number;
  businessUpdated: boolean;
}

/**
 * Commits an (owner-reviewed) proposal: updates business_info, inserts products,
 * and ingests FAQs + the raw source into the KB. Runs with the service role;
 * the caller (API route) must already have authorized the workspace.
 */
export async function applyOnboardingProposal(
  workspaceId: string,
  proposal: OnboardingProposal,
  options: ApplyOptions,
): Promise<ApplyResult> {
  const supabase = svc();
  const result: ApplyResult = {
    productsCreated: 0,
    faqsIngested: 0,
    businessUpdated: false,
  };

  // 1. Business info → business_info (structured + a readable free_text summary).
  if (options.applyBusiness) {
    const b = proposal.business;
    const freeTextLines = [
      b.description,
      b.address ? `Dirección: ${b.address}` : null,
      b.hours ? `Horarios: ${b.hours}` : null,
      b.phone ? `Teléfono: ${b.phone}` : null,
      b.email ? `Email: ${b.email}` : null,
      b.website ? `Web: ${b.website}` : null,
    ].filter(Boolean);

    const structured: Record<string, unknown> = {};
    if (b.name) structured.name = b.name;
    if (b.address) structured.address = b.address;
    if (b.hours) structured.hours = b.hours;
    if (b.phone) structured.phone = b.phone;
    if (b.email) structured.email = b.email;
    if (b.website) structured.website = b.website;

    // Upsert-style: update if present, else insert.
    const { data: existing } = await supabase
      .from("business_info")
      .select("workspace_id")
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("business_info")
        .update({
          structured,
          free_text: freeTextLines.join("\n"),
        })
        .eq("workspace_id", workspaceId);
    } else {
      await supabase.from("business_info").insert({
        workspace_id: workspaceId,
        structured,
        free_text: freeTextLines.join("\n"),
      });
    }
    result.businessUpdated = true;
  }

  // 2. Products → catalog.
  if (options.applyProducts) {
    for (const p of proposal.products) {
      try {
        await createProduct(supabase, workspaceId, {
          type: p.type,
          name: p.name,
          description: p.description ?? undefined,
          price: p.price ?? 0,
          stock_qty: p.type === "product" ? null : null,
          is_active: true,
        });
        result.productsCreated++;
      } catch (err) {
        console.error("[onboarding-ai] product insert failed:", err);
      }
    }
  }

  // 3. FAQs + raw source → KB.
  if (options.applyFaqs) {
    if (proposal.faqs.length > 0) {
      const faqDoc = proposal.faqs
        .map((f) => `P: ${f.question}\nR: ${f.answer}`)
        .join("\n\n");
      try {
        await ingestDocument({
          workspaceId,
          title: "Preguntas frecuentes",
          content: faqDoc,
          sourceType: "faq",
          meta: { origin: "ai_onboarding" },
        });
        result.faqsIngested = proposal.faqs.length;
      } catch (err) {
        console.error("[onboarding-ai] FAQ ingest failed:", err);
      }
    }
    // Keep the raw source text too, so the agent can answer beyond the FAQs.
    if (proposal.rawText.trim().length > 40) {
      try {
        await ingestDocument({
          workspaceId,
          title: "Información del negocio (autocarga)",
          content: proposal.rawText,
          sourceType: "doc",
          meta: { origin: "ai_onboarding" },
        });
      } catch (err) {
        console.error("[onboarding-ai] raw ingest failed:", err);
      }
    }
  }

  return result;
}
