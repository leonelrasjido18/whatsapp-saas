-- Seed create_recurring_order + auto-enable for commerce workspaces.

INSERT INTO public.tools (key, name, description, schema, sensitivity) VALUES
  (
    'create_recurring_order',
    'Pedido recurrente',
    'Programa un pedido recurrente para el cliente (mandame lo mismo cada X días). Cada período se recrea el pedido y se le avisa. Usar cuando el cliente pide repetir una compra periódicamente.',
    '{"type":"object","properties":{"items":{"type":"array","items":{"type":"object","properties":{"product_id":{"type":"string","format":"uuid"},"qty":{"type":"integer"}},"required":["product_id"]}},"frequency_days":{"type":"integer"}},"required":["items","frequency_days"]}',
    'write'
  )
ON CONFLICT (key) DO UPDATE
  SET name = EXCLUDED.name, description = EXCLUDED.description,
      schema = EXCLUDED.schema, sensitivity = EXCLUDED.sensitivity;

INSERT INTO public.tool_configs (workspace_id, tool_id, enabled)
SELECT tc.workspace_id, t_ro.id, TRUE
FROM public.tool_configs tc
JOIN public.tools t_search ON t_search.id = tc.tool_id AND t_search.key = 'catalog_search'
CROSS JOIN (SELECT id FROM public.tools WHERE key = 'create_recurring_order') t_ro
WHERE tc.enabled = TRUE
ON CONFLICT (workspace_id, tool_id) DO NOTHING;
