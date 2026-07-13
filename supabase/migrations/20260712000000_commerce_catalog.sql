-- FASE 1: Commerce Catalog & Stock Foundation

-- 1. Product Categories
CREATE TABLE product_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, name)
);

ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view product_categories of their workspaces" ON product_categories
  FOR SELECT
  USING (workspace_id IN (SELECT auth_workspace_ids()));

CREATE POLICY "Admins/managers can insert product_categories" ON product_categories
  FOR INSERT
  WITH CHECK (
    workspace_id IN (SELECT auth_workspace_ids()) AND 
    auth_has_role(workspace_id, ARRAY['admin', 'manager']::workspace_role[])
  );

CREATE POLICY "Admins/managers can update product_categories" ON product_categories
  FOR UPDATE
  USING (
    workspace_id IN (SELECT auth_workspace_ids()) AND 
    auth_has_role(workspace_id, ARRAY['admin', 'manager']::workspace_role[])
  );

CREATE POLICY "Admins/managers can delete product_categories" ON product_categories
  FOR DELETE
  USING (
    workspace_id IN (SELECT auth_workspace_ids()) AND 
    auth_has_role(workspace_id, ARRAY['admin', 'manager']::workspace_role[])
  );

-- 2. Products
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  category_id UUID REFERENCES product_categories(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('product', 'service')),
  name TEXT NOT NULL,
  description TEXT,
  sku TEXT,
  price DECIMAL(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'ARS',
  stock_qty INT CHECK (
    (type = 'product' AND stock_qty IS NOT NULL) OR 
    (type = 'service' AND stock_qty IS NULL)
  ),
  low_stock_threshold INT DEFAULT 3,
  image_paths TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partial unique for SKU per workspace
CREATE UNIQUE INDEX products_sku_workspace_idx ON products(workspace_id, sku) WHERE sku IS NOT NULL AND sku != '';
-- Indexes for performance
CREATE INDEX products_ws_active_idx ON products(workspace_id) WHERE is_active = true;
CREATE INDEX products_name_trgm_idx ON products USING gin (name gin_trgm_ops); -- assumes pg_trgm installed

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view products of their workspaces" ON products
  FOR SELECT
  USING (workspace_id IN (SELECT auth_workspace_ids()));

CREATE POLICY "Admins/managers can insert products" ON products
  FOR INSERT
  WITH CHECK (
    workspace_id IN (SELECT auth_workspace_ids()) AND 
    auth_has_role(workspace_id, ARRAY['admin', 'manager']::workspace_role[])
  );

CREATE POLICY "Admins/managers can update products" ON products
  FOR UPDATE
  USING (
    workspace_id IN (SELECT auth_workspace_ids()) AND 
    auth_has_role(workspace_id, ARRAY['admin', 'manager']::workspace_role[])
  );

CREATE POLICY "Admins/managers can delete products" ON products
  FOR DELETE
  USING (
    workspace_id IN (SELECT auth_workspace_ids()) AND 
    auth_has_role(workspace_id, ARRAY['admin', 'manager']::workspace_role[])
  );

-- 3. Stock Movements (ledger append-only)
CREATE TABLE stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('venta', 'compra', 'ajuste', 'devolucion')),
  qty INT NOT NULL, -- signed
  stock_after INT NOT NULL,
  note TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL, -- NULL = system/IA
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX stock_movements_product_idx ON stock_movements(product_id);

ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view stock_movements of their workspaces" ON stock_movements
  FOR SELECT
  USING (workspace_id IN (SELECT auth_workspace_ids()));

CREATE POLICY "Admins, managers, agents can insert stock_movements" ON stock_movements
  FOR INSERT
  WITH CHECK (
    workspace_id IN (SELECT auth_workspace_ids()) AND 
    auth_has_role(workspace_id, ARRAY['admin', 'manager', 'agent']::workspace_role[])
  );
-- NO update/delete on stock_movements allowed. Ledger is append only.

-- 4. RPC for adjusting stock atomically
CREATE OR REPLACE FUNCTION adjust_stock(
  p_workspace_id UUID,
  p_product_id UUID,
  p_delta INT,
  p_type TEXT,
  p_note TEXT,
  p_user_id UUID
) RETURNS INT AS $$
DECLARE
  v_current_stock INT;
  v_new_stock INT;
  v_product_type TEXT;
BEGIN
  -- Verify workspace role (must be admin/manager for manual adjustments via API)
  -- The agent could also trigger adjustments, but usually via an order flow, which has its own RPC.
  -- To be safe, we allow 'agent' as well, but rely on API/Tools for deeper restrictions.
  IF NOT auth_has_role(p_workspace_id, ARRAY['admin', 'manager', 'agent']::workspace_role[]) THEN
    RAISE EXCEPTION 'Not authorized to adjust stock';
  END IF;

  -- Lock row for update
  SELECT stock_qty, type INTO v_current_stock, v_product_type 
  FROM products 
  WHERE id = p_product_id AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  IF v_product_type = 'service' THEN
    RAISE EXCEPTION 'Cannot adjust stock for a service';
  END IF;

  v_new_stock := v_current_stock + p_delta;

  UPDATE products 
  SET stock_qty = v_new_stock, updated_at = NOW()
  WHERE id = p_product_id;

  INSERT INTO stock_movements (
    workspace_id, product_id, type, qty, stock_after, note, created_by
  ) VALUES (
    p_workspace_id, p_product_id, p_type, p_delta, v_new_stock, p_note, p_user_id
  );

  RETURN v_new_stock;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
