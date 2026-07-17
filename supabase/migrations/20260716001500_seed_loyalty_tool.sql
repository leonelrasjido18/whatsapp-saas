-- Seed get_loyalty_points + auto-enable for commerce workspaces.

INSERT INTO public.tools (key, name, description, schema, sensitivity) VALUES
  (
    'get_loyalty_points',
    'Consultar puntos de fidelidad',
    'Consulta cuántos puntos de fidelidad acumuló el cliente. Usar cuando pregunta por sus puntos o beneficios.',
    '{"type":"object","properties":{}}',
    'read'
  )
ON CONFLICT (key) DO UPDATE
  SET name = EXCLUDED.name, description = EXCLUDED.description,
      schema = EXCLUDED.schema, sensitivity = EXCLUDED.sensitivity;

INSERT INTO public.tool_configs (workspace_id, tool_id, enabled)
SELECT tc.workspace_id, t_lp.id, TRUE
FROM public.tool_configs tc
JOIN public.tools t_search ON t_search.id = tc.tool_id AND t_search.key = 'catalog_search'
CROSS JOIN (SELECT id FROM public.tools WHERE key = 'get_loyalty_points') t_lp
WHERE tc.enabled = TRUE
ON CONFLICT (workspace_id, tool_id) DO NOTHING;
