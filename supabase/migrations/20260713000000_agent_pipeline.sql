-- ============================================================
-- Sales pipeline: pipeline de 3 agentes por conversación.
--   Calificador (setter) → Ventas (soporte) → Posventa (agendamiento)
--
-- - workspaces.sales_pipeline_enabled: opt-in por workspace. Con false, el
--   runtime mantiene el comportamiento actual (un único agente activo global).
-- - conversations.pipeline_stage: etapa actual de la conversación. NULL se
--   trata como 'setter' (Calificador) en el runtime cuando el pipeline está on.
-- Reutiliza el enum agent_type existente (setter/soporte/agendamiento) como
-- clave interna de etapa — los labels visibles son Calificador/Ventas/Posventa.
-- ============================================================

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS sales_pipeline_enabled BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS pipeline_stage agent_type;

CREATE INDEX IF NOT EXISTS idx_conversations_pipeline_stage
  ON conversations(workspace_id, pipeline_stage);
