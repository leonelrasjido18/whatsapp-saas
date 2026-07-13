-- ============================================================
-- Migration: 20260712000700_commerce_rich_analytics
-- Rich analytics RPC for commerce dashboards
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_sales_metrics(p_workspace_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_today NUMERIC := 0;
  v_week NUMERIC := 0;
  v_month NUMERIC := 0;
  v_total NUMERIC := 0;
  v_avg_ticket NUMERIC := 0;
  v_methods JSONB;
  v_sources JSONB;
  v_channels JSONB;
  v_top_products JSONB;
  v_low_stock_count INT := 0;
BEGIN
  -- 1. Totales de ventas (órdenes paid)
  SELECT 
    COALESCE(SUM(CASE WHEN created_at >= date_trunc('day', now()) THEN total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN created_at >= date_trunc('week', now()) THEN total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN created_at >= date_trunc('month', now()) THEN total ELSE 0 END), 0),
    COALESCE(SUM(total), 0),
    COALESCE(AVG(total), 0)
  INTO v_today, v_week, v_month, v_total, v_avg_ticket
  FROM orders
  WHERE workspace_id = p_workspace_id AND status = 'paid';

  -- 2. Desglose por método de pago (mes actual)
  SELECT COALESCE(jsonb_object_agg(COALESCE(payment_method, 'desconocido'), m_total), '{}'::jsonb)
  INTO v_methods
  FROM (
    SELECT payment_method, SUM(total) as m_total
    FROM orders 
    WHERE workspace_id = p_workspace_id AND status = 'paid' AND created_at >= date_trunc('month', now())
    GROUP BY payment_method
  ) sub;

  -- 3. Desglose por origen (mes actual)
  SELECT COALESCE(jsonb_object_agg(source, m_total), '{}'::jsonb)
  INTO v_sources
  FROM (
    SELECT source, SUM(total) as m_total
    FROM orders 
    WHERE workspace_id = p_workspace_id AND status = 'paid' AND created_at >= date_trunc('month', now())
    GROUP BY source
  ) sub;

  -- 4. Desglose por canal (mes actual)
  SELECT COALESCE(jsonb_object_agg(COALESCE(channel::text, 'web'), m_total), '{}'::jsonb)
  INTO v_channels
  FROM (
    SELECT channel, SUM(total) as m_total
    FROM orders 
    WHERE workspace_id = p_workspace_id AND status = 'paid' AND created_at >= date_trunc('month', now())
    GROUP BY channel
  ) sub;

  -- 5. Top 5 productos (mes actual)
  SELECT COALESCE(jsonb_agg(jsonb_build_object('name', product_name, 'qty', total_qty, 'revenue', total_rev)), '[]'::jsonb)
  INTO v_top_products
  FROM (
    SELECT product_name, SUM(qty) as total_qty, SUM(line_total) as total_rev
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE o.workspace_id = p_workspace_id AND o.status = 'paid' AND o.created_at >= date_trunc('month', now())
    GROUP BY product_name
    ORDER BY total_qty DESC
    LIMIT 5
  ) sub;

  -- 6. Productos con stock bajo (<= 5)
  SELECT COUNT(*)
  INTO v_low_stock_count
  FROM products
  WHERE workspace_id = p_workspace_id AND is_active = true AND track_stock = true AND stock <= 5;

  RETURN jsonb_build_object(
    'today', v_today,
    'week', v_week,
    'month', v_month,
    'total', v_total,
    'avg_ticket', v_avg_ticket,
    'by_method', v_methods,
    'by_source', v_sources,
    'by_channel', v_channels,
    'top_products', v_top_products,
    'low_stock_count', v_low_stock_count
  );
END;
$$;
