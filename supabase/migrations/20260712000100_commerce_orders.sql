-- FASE 2: Ventas (Órdenes + POS-lite)

-- 1. Workspace Counters (for order sequences)
CREATE TABLE workspace_counters (
  workspace_id UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  order_seq INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Orders
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  order_number INT NOT NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  source TEXT NOT NULL CHECK (source IN ('chat', 'manual')),
  channel conversation_channel,
  status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'cancelled', 'refunded')),
  payment_method TEXT CHECK (payment_method IN ('efectivo', 'transferencia', 'mercadopago', 'otro')),
  subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
  discount DECIMAL(12,2) NOT NULL DEFAULT 0,
  total DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL, -- NULL = IA
  mp_preference_id TEXT,
  mp_payment_id TEXT,
  paid_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, order_number)
);

CREATE INDEX orders_ws_status_idx ON orders(workspace_id, status);

-- 3. Order Items
CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  product_type TEXT NOT NULL CHECK (product_type IN ('product', 'service')),
  unit_price DECIMAL(12,2) NOT NULL,
  qty INT NOT NULL CHECK (qty > 0),
  line_total DECIMAL(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Alter stock_movements
ALTER TABLE stock_movements ADD COLUMN order_id UUID REFERENCES orders(id) ON DELETE SET NULL;

-- 5. RLS
ALTER TABLE workspace_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view workspace_counters of their workspaces" ON workspace_counters FOR SELECT USING (workspace_id IN (SELECT auth_workspace_ids()));
CREATE POLICY "Admins/managers can modify workspace_counters" ON workspace_counters FOR ALL USING (workspace_id IN (SELECT auth_workspace_ids()) AND auth_has_role(workspace_id, ARRAY['admin', 'manager', 'agent']::workspace_role[]));

CREATE POLICY "Users can view orders of their workspaces" ON orders FOR SELECT USING (workspace_id IN (SELECT auth_workspace_ids()));
CREATE POLICY "Users can insert orders" ON orders FOR INSERT WITH CHECK (workspace_id IN (SELECT auth_workspace_ids()));
CREATE POLICY "Users can update orders" ON orders FOR UPDATE USING (workspace_id IN (SELECT auth_workspace_ids()));

CREATE POLICY "Users can view order_items of their workspaces" ON order_items FOR SELECT USING (order_id IN (SELECT id FROM orders WHERE workspace_id IN (SELECT auth_workspace_ids())));
CREATE POLICY "Users can insert order_items" ON order_items FOR INSERT WITH CHECK (order_id IN (SELECT id FROM orders WHERE workspace_id IN (SELECT auth_workspace_ids())));

-- 6. RPCs

CREATE OR REPLACE FUNCTION create_order_with_items(
  p_workspace_id UUID,
  p_contact_id UUID,
  p_conversation_id UUID,
  p_source TEXT,
  p_items JSONB, -- Array of { product_id, qty }
  p_note TEXT,
  p_created_by UUID,
  p_channel conversation_channel,
  p_discount DECIMAL(12,2)
) RETURNS JSONB AS $$
DECLARE
  v_order_number INT;
  v_order_id UUID;
  v_subtotal DECIMAL(12,2) := 0;
  v_item JSONB;
  v_product_id UUID;
  v_qty INT;
  v_product RECORD;
  v_line_total DECIMAL(12,2);
  v_order_json JSONB;
BEGIN
  -- Insert or update counter
  INSERT INTO workspace_counters (workspace_id, order_seq)
  VALUES (p_workspace_id, 1)
  ON CONFLICT (workspace_id) DO UPDATE 
  SET order_seq = workspace_counters.order_seq + 1, updated_at = NOW()
  RETURNING order_seq INTO v_order_number;

  -- Create pending order
  INSERT INTO orders (
    workspace_id, order_number, contact_id, conversation_id, source, 
    channel, status, created_by, discount
  ) VALUES (
    p_workspace_id, v_order_number, p_contact_id, p_conversation_id, p_source, 
    p_channel, 'pending', p_created_by, COALESCE(p_discount, 0)
  ) RETURNING id INTO v_order_id;

  -- Process items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_qty := (v_item->>'qty')::INT;

    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Quantity must be positive';
    END IF;

    -- Lock product row
    SELECT * INTO v_product FROM products 
    WHERE id = v_product_id AND workspace_id = p_workspace_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product not found: %', v_product_id;
    END IF;

    IF NOT v_product.is_active THEN
      RAISE EXCEPTION 'Product is inactive: %', v_product.name;
    END IF;

    IF v_product.type = 'product' AND v_product.stock_qty < v_qty THEN
      RAISE EXCEPTION 'out_of_stock:%:%', v_product.name, v_product.stock_qty;
    END IF;

    v_line_total := v_product.price * v_qty;
    v_subtotal := v_subtotal + v_line_total;

    INSERT INTO order_items (
      order_id, product_id, product_name, product_type, unit_price, qty, line_total
    ) VALUES (
      v_order_id, v_product_id, v_product.name, v_product.type, v_product.price, v_qty, v_line_total
    );
  END LOOP;

  -- Update order totals
  UPDATE orders 
  SET subtotal = v_subtotal, total = v_subtotal - COALESCE(p_discount, 0), meta = jsonb_build_object('note', COALESCE(p_note, ''))
  WHERE id = v_order_id;

  SELECT to_jsonb(o.*) INTO v_order_json FROM orders o WHERE id = v_order_id;
  RETURN v_order_json;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION apply_order_payment(
  p_workspace_id UUID,
  p_order_id UUID,
  p_payment_method TEXT,
  p_mp_payment_id TEXT,
  p_user_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  v_order RECORD;
  v_item RECORD;
  v_product RECORD;
  v_new_stock INT;
BEGIN
  SELECT * INTO v_order FROM orders 
  WHERE id = p_order_id AND workspace_id = p_workspace_id AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  UPDATE orders 
  SET status = 'paid', payment_method = p_payment_method, mp_payment_id = p_mp_payment_id, paid_at = NOW(), updated_at = NOW()
  WHERE id = p_order_id;

  FOR v_item IN SELECT * FROM order_items WHERE order_id = p_order_id
  LOOP
    IF v_item.product_type = 'product' AND v_item.product_id IS NOT NULL THEN
      SELECT * INTO v_product FROM products 
      WHERE id = v_item.product_id AND workspace_id = p_workspace_id
      FOR UPDATE;

      IF FOUND THEN
        v_new_stock := v_product.stock_qty - v_item.qty;
        UPDATE products SET stock_qty = v_new_stock, updated_at = NOW() WHERE id = v_item.product_id;
        INSERT INTO stock_movements (
          workspace_id, product_id, order_id, type, qty, stock_after, note, created_by
        ) VALUES (
          p_workspace_id, v_item.product_id, p_order_id, 'venta', -v_item.qty, v_new_stock, 'Venta orden #' || v_order.order_number, p_user_id
        );
      END IF;
    END IF;
  END LOOP;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION refund_order(
  p_workspace_id UUID,
  p_order_id UUID,
  p_user_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  v_order RECORD;
  v_item RECORD;
  v_product RECORD;
  v_new_stock INT;
BEGIN
  SELECT * INTO v_order FROM orders 
  WHERE id = p_order_id AND workspace_id = p_workspace_id AND status = 'paid'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  UPDATE orders 
  SET status = 'refunded', refunded_at = NOW(), updated_at = NOW()
  WHERE id = p_order_id;

  FOR v_item IN SELECT * FROM order_items WHERE order_id = p_order_id
  LOOP
    IF v_item.product_type = 'product' AND v_item.product_id IS NOT NULL THEN
      SELECT * INTO v_product FROM products 
      WHERE id = v_item.product_id AND workspace_id = p_workspace_id
      FOR UPDATE;

      IF FOUND THEN
        v_new_stock := v_product.stock_qty + v_item.qty;
        UPDATE products SET stock_qty = v_new_stock, updated_at = NOW() WHERE id = v_item.product_id;
        INSERT INTO stock_movements (
          workspace_id, product_id, order_id, type, qty, stock_after, note, created_by
        ) VALUES (
          p_workspace_id, v_item.product_id, p_order_id, 'devolucion', v_item.qty, v_new_stock, 'Devolución orden #' || v_order.order_number, p_user_id
        );
      END IF;
    END IF;
  END LOOP;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION cancel_order(
  p_workspace_id UUID,
  p_order_id UUID,
  p_user_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  v_order RECORD;
BEGIN
  SELECT * INTO v_order FROM orders 
  WHERE id = p_order_id AND workspace_id = p_workspace_id AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  UPDATE orders 
  SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
  WHERE id = p_order_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
