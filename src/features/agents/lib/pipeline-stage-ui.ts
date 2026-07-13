import type { AgentType } from "@/features/agents/types";

// UI compartida para las etapas del pipeline de ventas. Labels cortos (para
// badges) y clases de color. Reutiliza el enum agent_type como clave de etapa.

export const PIPELINE_STAGE_ORDER: AgentType[] = [
  "setter",
  "soporte",
  "agendamiento",
];

export const PIPELINE_STAGE_LABEL: Record<AgentType, string> = {
  setter: "Calificador",
  soporte: "Ventas",
  agendamiento: "Posventa",
};

// Badge classes — legibles en claro y oscuro.
export const PIPELINE_STAGE_BADGE_CLASS: Record<AgentType, string> = {
  setter:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  soporte: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300",
  agendamiento:
    "bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300",
};
