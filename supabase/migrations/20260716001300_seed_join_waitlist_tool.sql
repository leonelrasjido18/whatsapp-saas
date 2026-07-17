-- Seed the join_waitlist tool + auto-enable for commerce workspaces (catalog_search on).

INSERT INTO public.tools (key, name, description, schema, sensitivity) VALUES
  (
    'join_waitlist',
    'Lista de espera (avisar cuando haya stock)',
    'Anota al cliente para avisarle cuando un producto SIN STOCK vuelva a estar disponible. Usar cuando el cliente quiere algo agotado. Confirmale que le vas a avisar cuando llegue.',
    '{"type":"object","properties":{"product_id":{"type":"string","format":"uuid","description":"ID del producto sin stock."}},"required":["product_id"]}',
    'write'
  )
ON CONFLICT (key) DO UPDATE
  SET name = EXCLUDED.name, description = EXCLUDED.description,
      schema = EXCLUDED.schema, sensitivity = EXCLUDED.sensitivity;

INSERT INTO public.tool_configs (workspace_id, tool_id, enabled)
SELECT tc.workspace_id, t_wl.id, TRUE
FROM public.tool_configs tc
JOIN public.tools t_search ON t_search.id = tc.tool_id AND t_search.key = 'catalog_search'
CROSS JOIN (SELECT id FROM public.tools WHERE key = 'join_waitlist') t_wl
WHERE tc.enabled = TRUE
ON CONFLICT (workspace_id, tool_id) DO NOTHING;
