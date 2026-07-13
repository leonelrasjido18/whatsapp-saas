-- FASE 5: Analytics & Client Classification

-- 1. RPC para obtener balances rápidos de ventas (sólo órdenes pagadas)
CREATE OR REPLACE FUNCTION get_sales_metrics(p_workspace_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_today NUMERIC := 0;
  v_week NUMERIC := 0;
  v_month NUMERIC := 0;
  v_total NUMERIC := 0;
BEGIN
  -- Sumar totales de órdenes 'paid'
  SELECT 
    COALESCE(SUM(CASE WHEN created_at >= date_trunc('day', now()) THEN total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN created_at >= date_trunc('week', now()) THEN total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN created_at >= date_trunc('month', now()) THEN total ELSE 0 END), 0),
    COALESCE(SUM(total), 0)
  INTO v_today, v_week, v_month, v_total
  FROM orders
  WHERE workspace_id = p_workspace_id AND status = 'paid';

  RETURN jsonb_build_object(
    'today', v_today,
    'week', v_week,
    'month', v_month,
    'total', v_total
  );
END;
$$;

-- 2. View para clientes del comercio (contactos con métricas de ventas)
-- Como las vistas normales no toman parámetros, usamos una vista y filtramos por workspace_id luego,
-- o creamos una RPC. Hagamos una vista normal para aprovechar PostgREST (select desde supabase).

CREATE OR REPLACE VIEW commerce_clients AS
SELECT 
  c.id,
  c.workspace_id,
  c.name,
  c.phone,
  c.created_at,
  COUNT(o.id) FILTER (WHERE o.status = 'paid') as total_orders,
  COALESCE(SUM(o.total) FILTER (WHERE o.status = 'paid'), 0) as total_spent,
  MAX(o.created_at) as last_order_date,
  CASE
    WHEN COUNT(o.id) FILTER (WHERE o.status = 'paid') >= 5 THEN 'VIP'
    WHEN COUNT(o.id) FILTER (WHERE o.status = 'paid') >= 2 THEN 'Recurrente'
    WHEN COUNT(o.id) FILTER (WHERE o.status = 'paid') = 1 THEN 'Nuevo'
    ELSE 'Prospecto'
  END as classification
FROM contacts c
LEFT JOIN orders o ON o.contact_id = c.id
GROUP BY c.id, c.workspace_id, c.name, c.phone, c.created_at;

-- Otorgar permisos a la vista
GRANT SELECT ON commerce_clients TO authenticated;
GRANT SELECT ON commerce_clients TO service_role;
