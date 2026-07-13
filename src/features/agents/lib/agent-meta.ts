import type { AgentType } from "@/features/agents/types";

// Per-role metadata: labels, taglines, and prompt-writing guidance. Reused by
// the agent cards and the guided prompt editor (Fase 3).

export interface AgentTypeMeta {
  label: string;
  tagline: string;
  /** Bullet guidance shown in the guided prompt editor. */
  promptGuidance: string[];
}

export const AGENT_TYPE_META: Record<AgentType, AgentTypeMeta> = {
  setter: {
    label: "Agente Calificador",
    tagline: "Califica prospectos y detecta intención de compra",
    promptGuidance: [
      "Define el objetivo: entender qué necesita el prospecto y calificarlo.",
      "Lista las preguntas clave para calificar (necesidad, presupuesto, urgencia).",
      "Cuando detectes intención de compra clara, pasá la conversación a Ventas (handoff).",
      "Tono: amable, profesional y directo. Mensajes cortos.",
    ],
  },
  soporte: {
    label: "Agente de Ventas",
    tagline: "Cierra la venta: arma el pedido y cobra",
    promptGuidance: [
      "Antes de dar precios o disponibilidad, buscá siempre en el catálogo real.",
      "Cuando el cliente confirme, creá el pedido y ofrecé el link de pago.",
      "No inventes precios ni productos que no estén en el catálogo.",
      "Tono: cercano y resolutivo. Guiá al cliente hasta el pago.",
    ],
  },
  agendamiento: {
    label: "Agente de Posventa",
    tagline: "Seguimiento post-compra: envío, dudas y fidelización",
    promptGuidance: [
      "La compra ya se pagó: enfocate en el seguimiento y la experiencia.",
      "Informá estado del pedido, tiempos de envío y próximos pasos.",
      "Resolvé dudas post-venta y detectá oportunidades de recompra.",
      "Tono: cordial y proactivo.",
    ],
  },
};
