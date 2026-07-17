-- Seed create_quote + auto-enable for workspaces that run an agent (any tool on).

INSERT INTO public.tools (key, name, description, schema, sensitivity) VALUES
  (
    'create_quote',
    'Crear presupuesto',
    'Crea un presupuesto/cotización formal con ítems y precios y devuelve un link para compartir con el cliente. Usar cuando el cliente pide un presupuesto por escrito.',
    '{"type":"object","properties":{"items":{"type":"array","items":{"type":"object","properties":{"description":{"type":"string"},"unit_price":{"type":"number"},"qty":{"type":"integer"}},"required":["description","unit_price"]}},"note":{"type":"string"},"valid_days":{"type":"integer"}},"required":["items"]}',
    'write'
  )
ON CONFLICT (key) DO UPDATE
  SET name = EXCLUDED.name, description = EXCLUDED.description,
      schema = EXCLUDED.schema, sensitivity = EXCLUDED.sensitivity;

INSERT INTO public.tool_configs (workspace_id, tool_id, enabled)
SELECT DISTINCT tc.workspace_id, t_q.id, TRUE
FROM public.tool_configs tc
CROSS JOIN (SELECT id FROM public.tools WHERE key = 'create_quote') t_q
WHERE tc.enabled = TRUE
ON CONFLICT (workspace_id, tool_id) DO NOTHING;
