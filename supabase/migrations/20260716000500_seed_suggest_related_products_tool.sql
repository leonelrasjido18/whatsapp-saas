-- Seed the suggest_related_products tool (upsell / cross-sell) and auto-enable it
-- for every workspace that already has catalog_search on (commerce workspaces).

INSERT INTO public.tools (key, name, description, schema, sensitivity) VALUES
  (
    'suggest_related_products',
    'Sugerir productos relacionados',
    'Devuelve productos relacionados para venta cruzada / upsell. Usar tras confirmar interés en un producto para ofrecer un complemento o una opción superior. Sugerir 1 o 2 como máximo, sin insistir.',
    '{"type":"object","properties":{"product_id":{"type":"string","format":"uuid","description":"ID del producto que le interesa al cliente."}},"required":["product_id"]}',
    'read'
  )
ON CONFLICT (key) DO UPDATE
  SET name        = EXCLUDED.name,
      description = EXCLUDED.description,
      schema      = EXCLUDED.schema,
      sensitivity = EXCLUDED.sensitivity;

INSERT INTO public.tool_configs (workspace_id, tool_id, enabled)
SELECT tc.workspace_id, t_rel.id, TRUE
FROM public.tool_configs tc
JOIN public.tools t_search ON t_search.id = tc.tool_id AND t_search.key = 'catalog_search'
CROSS JOIN (SELECT id FROM public.tools WHERE key = 'suggest_related_products') t_rel
WHERE tc.enabled = TRUE
ON CONFLICT (workspace_id, tool_id) DO NOTHING;
