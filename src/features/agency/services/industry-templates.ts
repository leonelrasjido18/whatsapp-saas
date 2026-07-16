// industry-templates.ts — one-click "rubro" presets so the agency can stand up a
// new client in minutes instead of hours. Applying a template seeds: the agent
// prompt, a demo catalog, business FAQs (KB), the business type, and the relevant
// tools. Everything reuses the same primitives as manual setup.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createProduct } from "@/features/commerce/services/catalog";
import { ingestDocument } from "@/features/inbox/services/kb-service";
import type { BusinessType } from "@/features/workspace/lib/business-type";

export interface IndustryTemplate {
  key: string;
  label: string;
  businessType: BusinessType;
  /** {{business_name}} is substituted at apply time. */
  prompt: string;
  demoProducts: Array<{
    name: string;
    description: string;
    price: number;
    type: "product" | "service";
  }>;
  faqs: Array<{ q: string; a: string }>;
  toolKeys: string[];
}

const COMMON_SALES_TOOLS = [
  "catalog_search",
  "send_product_image",
  "send_quick_replies",
  "create_order",
  "generate_payment_link",
  "get_order_status",
];
const COMMON_BOOKING_TOOLS = [
  "send_quick_replies",
  "check_availability_native",
  "book_appointment",
  "cancel_appointment",
];

export const INDUSTRY_TEMPLATES: IndustryTemplate[] = [
  {
    key: "peluqueria",
    label: "Peluquería / Estética",
    businessType: "servicios",
    prompt:
      "Sos el asistente de {{business_name}}, una peluquería/estética. Ayudás a los clientes a reservar turnos, informás precios de servicios y respondés dudas. Sé cálido y breve. Cuando quieran un turno, ofrecé los horarios disponibles y confirmá el servicio.",
    demoProducts: [
      { name: "Corte de cabello", description: "Corte y peinado", price: 8000, type: "service" },
      { name: "Color", description: "Coloración completa", price: 20000, type: "service" },
      { name: "Brushing", description: "Lavado y brushing", price: 6000, type: "service" },
    ],
    faqs: [
      { q: "¿Cómo saco un turno?", a: "Escribime el día y horario que preferís y te confirmo la disponibilidad." },
      { q: "¿Qué formas de pago aceptan?", a: "Efectivo, transferencia y tarjeta." },
    ],
    toolKeys: COMMON_BOOKING_TOOLS,
  },
  {
    key: "restaurante",
    label: "Restaurante / Delivery",
    businessType: "comercio",
    prompt:
      "Sos el asistente de {{business_name}}, un restaurante con delivery y take away. Tomás pedidos, informás el menú y los precios, y coordinás la entrega. Sé rápido y directo. Cerrá el pedido y ofrecé el link de pago.",
    demoProducts: [
      { name: "Milanesa con papas", description: "Milanesa de ternera con guarnición", price: 9000, type: "product" },
      { name: "Pizza muzzarella", description: "Grande, 8 porciones", price: 11000, type: "product" },
      { name: "Empanadas (docena)", description: "Surtidas", price: 12000, type: "product" },
    ],
    faqs: [
      { q: "¿Hacen delivery?", a: "Sí, coordinamos la entrega a domicilio. Pasame tu dirección." },
      { q: "¿Cuánto tarda el pedido?", a: "Entre 30 y 45 minutos según la zona." },
    ],
    toolKeys: COMMON_SALES_TOOLS,
  },
  {
    key: "indumentaria",
    label: "Indumentaria / Tienda de ropa",
    businessType: "comercio",
    prompt:
      "Sos el asistente de {{business_name}}, una tienda de indumentaria. Asesorás sobre talles y prendas, mostrás fotos de los productos y cerrás la venta. Sé amable y breve. Preguntá el talle cuando haga falta.",
    demoProducts: [
      { name: "Remera básica", description: "Algodón, varios colores", price: 12000, type: "product" },
      { name: "Jean", description: "Corte recto, talles 38-46", price: 28000, type: "product" },
      { name: "Buzo canguro", description: "Frisa, unisex", price: 24000, type: "product" },
    ],
    faqs: [
      { q: "¿Hacen cambios?", a: "Sí, tenés 30 días para cambiar con el ticket." },
      { q: "¿Hacen envíos?", a: "Enviamos a todo el país por correo." },
    ],
    toolKeys: COMMON_SALES_TOOLS,
  },
  {
    key: "kiosco",
    label: "Kiosco / Almacén",
    businessType: "comercio",
    prompt:
      "Sos el asistente de {{business_name}}, un kiosco/almacén de barrio. Tomás pedidos, informás precios y stock, y coordinás retiro o envío cercano. Sé rápido y práctico.",
    demoProducts: [
      { name: "Gaseosa 2.25L", description: "Línea Coca-Cola", price: 3500, type: "product" },
      { name: "Cigarrillos", description: "Varias marcas", price: 3000, type: "product" },
      { name: "Golosinas surtidas", description: "Combo", price: 2000, type: "product" },
    ],
    faqs: [
      { q: "¿Hacen envíos?", a: "Sí, a las cuadras cercanas. Pasame tu dirección." },
      { q: "¿Aceptan Mercado Pago?", a: "Sí, te paso el link o el alias." },
    ],
    toolKeys: COMMON_SALES_TOOLS,
  },
];

export function getIndustryTemplate(key: string): IndustryTemplate | undefined {
  return INDUSTRY_TEMPLATES.find((t) => t.key === key);
}

export interface ApplyTemplateResult {
  productsCreated: number;
  faqsIngested: number;
}

/**
 * Applies a template to a workspace: sets business type, seeds a demo catalog,
 * ingests FAQs, enables the relevant tools, and points the active agent at a new
 * published prompt version (same pattern as workspace creation). Service-role
 * client — the caller (super-admin action) must authorize first.
 */
export async function applyIndustryTemplate(
  supabase: SupabaseClient,
  workspaceId: string,
  template: IndustryTemplate,
  userId: string,
): Promise<ApplyTemplateResult> {
  const { data: ws } = await supabase
    .from("workspaces")
    .select("name")
    .eq("id", workspaceId)
    .single();
  const businessName = (ws?.name as string) ?? "el negocio";
  const promptBody = template.prompt.replaceAll("{{business_name}}", businessName);

  // 1. Business type.
  await supabase
    .from("workspaces")
    .update({ business_type: template.businessType })
    .eq("id", workspaceId);

  // 2. Update the active agent's prompt (new published version).
  const { data: activeAgent } = await supabase
    .from("agents")
    .select("prompt_id")
    .eq("workspace_id", workspaceId)
    .eq("is_active", true)
    .maybeSingle();

  const promptId = activeAgent?.prompt_id as string | undefined;
  if (promptId) {
    const { data: lastVersion } = await supabase
      .from("prompt_versions")
      .select("version")
      .eq("prompt_id", promptId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextVersion = ((lastVersion?.version as number | undefined) ?? 0) + 1;

    const { data: newVersion } = await supabase
      .from("prompt_versions")
      .insert({
        workspace_id: workspaceId,
        prompt_id: promptId,
        version: nextVersion,
        state: "published",
        body: promptBody,
        published_at: new Date().toISOString(),
        created_by: userId,
      })
      .select("id")
      .single();

    if (newVersion) {
      await supabase
        .from("prompts")
        .update({ active_version_id: (newVersion as { id: string }).id })
        .eq("id", promptId);
    }
  }

  // 3. Demo catalog.
  let productsCreated = 0;
  for (const p of template.demoProducts) {
    try {
      await createProduct(supabase, workspaceId, {
        type: p.type,
        name: p.name,
        description: p.description,
        price: p.price,
        stock_qty: p.type === "product" ? 10 : null,
        is_active: true,
      });
      productsCreated++;
    } catch (err) {
      console.error("[template] product seed failed:", err);
    }
  }

  // 4. FAQs → KB.
  let faqsIngested = 0;
  if (template.faqs.length > 0) {
    const content = template.faqs.map((f) => `P: ${f.q}\nR: ${f.a}`).join("\n\n");
    try {
      await ingestDocument({
        workspaceId,
        title: `FAQs — ${template.label}`,
        content,
        sourceType: "faq",
        meta: { origin: "industry_template", template: template.key },
      });
      faqsIngested = template.faqs.length;
    } catch (err) {
      console.error("[template] FAQ ingest failed:", err);
    }
  }

  // 5. Enable the recommended tools.
  if (template.toolKeys.length > 0) {
    const { data: toolRows } = await supabase
      .from("tools")
      .select("id, key")
      .in("key", template.toolKeys);
    const rows = (toolRows ?? []).map((t) => ({
      workspace_id: workspaceId,
      tool_id: (t as { id: string }).id,
      enabled: true,
    }));
    if (rows.length > 0) {
      await supabase
        .from("tool_configs")
        .upsert(rows, { onConflict: "workspace_id,tool_id", ignoreDuplicates: true });
    }
  }

  return { productsCreated, faqsIngested };
}
