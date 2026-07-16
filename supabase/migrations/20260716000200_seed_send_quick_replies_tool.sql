-- Migration (#4): seed the send_quick_replies tool so it can be enabled per
-- workspace and offered to the agent. It's a presentation helper (WhatsApp reply
-- buttons), so we auto-enable it for every workspace that already runs an agent
-- (i.e. has any tool enabled), matching how send_product_image was rolled out.

INSERT INTO public.tools (key, name, description, schema, sensitivity) VALUES
  (
    'send_quick_replies',
    'Botones de respuesta rápida',
    'Envía un mensaje de WhatsApp con botones tappeables (máximo 3). Usar para preguntas de sí/no, elegir entre pocas opciones o un llamado a la acción claro. Cuando el cliente toca un botón, su elección llega como si la hubiera escrito.',
    '{"type":"object","properties":{"body":{"type":"string","description":"Texto que acompaña a los botones."},"buttons":{"type":"array","items":{"type":"string","maxLength":20},"minItems":1,"maxItems":3,"description":"1 a 3 opciones tappeables, máx 20 caracteres cada una."}},"required":["body","buttons"]}',
    'write'
  )
ON CONFLICT (key) DO UPDATE
  SET name        = EXCLUDED.name,
      description = EXCLUDED.description,
      schema      = EXCLUDED.schema,
      sensitivity = EXCLUDED.sensitivity;

-- Auto-enable for every workspace that already has at least one tool enabled.
INSERT INTO public.tool_configs (workspace_id, tool_id, enabled)
SELECT DISTINCT tc.workspace_id, t_qr.id, TRUE
FROM public.tool_configs tc
CROSS JOIN (SELECT id FROM public.tools WHERE key = 'send_quick_replies') t_qr
WHERE tc.enabled = TRUE
ON CONFLICT (workspace_id, tool_id) DO NOTHING;
