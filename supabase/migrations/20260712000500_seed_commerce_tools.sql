-- ============================================================
-- Migration: 20260712000500_seed_commerce_tools
-- Seed the 4 commerce tools into public.tools so they appear
-- in workspace Settings → Tools and can be enabled per workspace.
-- Idempotent via ON CONFLICT (key).
-- ============================================================

INSERT INTO public.tools (key, name, description, schema, sensitivity) VALUES
  (
    'catalog_search',
    'Buscar en Catálogo',
    'OBLIGATORIO usarla antes de mencionar cualquier precio, producto o servicio. Busca en el catálogo real del comercio. Incluye precios, stock y disponibilidad. NUNCA inventes precios, productos ni promociones que no aparezcan aquí.',
    '{"type":"object","properties":{"query":{"type":"string","description":"Término de búsqueda. Vacío para listar todos los productos activos."}},"required":[]}',
    'read'
  ),
  (
    'create_order',
    'Crear Pedido',
    'Crea un pedido confirmado para el cliente con los productos del catálogo. Usarlo SOLO cuando el cliente confirme que quiere comprar. Luego informar número de orden y total. Ofrecer link de pago MP si está disponible.',
    '{"type":"object","properties":{"items":{"type":"array","items":{"type":"object","properties":{"product_id":{"type":"string","format":"uuid"},"qty":{"type":"integer","minimum":1}},"required":["product_id","qty"]},"minItems":1},"note":{"type":"string"}},"required":["items"]}',
    'write'
  ),
  (
    'get_order_status',
    'Ver Estado de Pedido',
    'Consulta el estado de un pedido del cliente. Retorna solo órdenes del contacto actual. Útil cuando el cliente pregunta "¿cómo va mi pedido?" o "¿cuándo llega?".',
    '{"type":"object","properties":{"order_number":{"type":"integer","description":"Número de orden (ej: 42). Opcional: si no se pasa se listan las últimas órdenes del contacto."}},"required":[]}',
    'read'
  ),
  (
    'generate_payment_link',
    'Generar Link de Pago MercadoPago',
    'Genera un link de Checkout Pro de MercadoPago para cobrar una orden. Usar si el cliente quiere pagar con tarjeta o digitalmente. Si el comercio no tiene MP configurado, ofrecer efectivo o transferencia en su lugar.',
    '{"type":"object","properties":{"order_id":{"type":"string","format":"uuid","description":"ID de la orden a cobrar"}},"required":["order_id"]}',
    'write'
  )
ON CONFLICT (key) DO UPDATE
  SET name        = EXCLUDED.name,
      description = EXCLUDED.description,
      schema      = EXCLUDED.schema,
      sensitivity = EXCLUDED.sensitivity;

-- ============================================================
-- End of migration: 20260712000500_seed_commerce_tools
-- ============================================================
