-- Migration: seed the send_product_image tool into the catalog.
-- It exists in the code registry but was never seeded into public.tools, so it
-- couldn't be enabled per workspace (tool_configs references tools.id) and the
-- agent could never send product photos. This registers it. Idempotent.

INSERT INTO public.tools (key, name, description, schema, sensitivity) VALUES
  (
    'send_product_image',
    'Enviar Foto de Producto',
    'Envía por WhatsApp la foto de un producto del catálogo. Usar cuando el cliente pide ver una foto, cuando manda una foto preguntando por un producto, o cuando una imagen ayuda a cerrar la venta. Si el producto no tiene foto cargada, avisar y seguir con la descripción por texto.',
    '{"type":"object","properties":{"product_id":{"type":"string","format":"uuid","description":"ID del producto (obtenido de catalog_search) cuya foto enviar."}},"required":["product_id"]}',
    'write'
  )
ON CONFLICT (key) DO UPDATE
  SET name        = EXCLUDED.name,
      description = EXCLUDED.description,
      schema      = EXCLUDED.schema,
      sensitivity = EXCLUDED.sensitivity;

-- Auto-enable it for every workspace that already has catalog search enabled
-- (i.e. commerce workspaces), so existing clients get product photos without
-- having to toggle anything.
INSERT INTO public.tool_configs (workspace_id, tool_id, enabled)
SELECT tc.workspace_id, t_img.id, TRUE
FROM public.tool_configs tc
JOIN public.tools t_search ON t_search.id = tc.tool_id AND t_search.key = 'catalog_search'
CROSS JOIN (SELECT id FROM public.tools WHERE key = 'send_product_image') t_img
WHERE tc.enabled = TRUE
ON CONFLICT (workspace_id, tool_id) DO NOTHING;
