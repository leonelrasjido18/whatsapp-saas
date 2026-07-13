export type ProductType = 'product' | 'service';
export type StockMovementType = 'venta' | 'compra' | 'ajuste' | 'devolucion';

export interface ProductCategory {
  id: string;
  workspace_id: string;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  workspace_id: string;
  category_id: string | null;
  type: ProductType;
  name: string;
  description: string | null;
  sku: string | null;
  price: number; // Stored as decimal(12,2) in DB, usually serialized as number
  currency: string;
  stock_qty: number | null; // Null for services
  low_stock_threshold: number;
  image_paths: string[];
  is_active: boolean;
  meta: Record<string, any>;
  created_at: string;
  updated_at: string;
  
  // Joins
  category?: ProductCategory;
}

export interface StockMovement {
  id: string;
  workspace_id: string;
  product_id: string;
  order_id: string | null;
  type: "carga_inicial" | "venta" | "compra" | "ajuste" | "devolucion";
  qty: number;
  stock_after: number;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  product_type: "product" | "service";
  unit_price: number;
  qty: number;
  line_total: number;
  created_at: string;
}

export interface Order {
  id: string;
  workspace_id: string;
  order_number: number;
  contact_id: string | null;
  conversation_id: string | null;
  source: "chat" | "manual";
  channel: string | null;
  status: "pending" | "paid" | "cancelled" | "refunded";
  payment_method: "efectivo" | "transferencia" | "mercadopago" | "otro" | null;
  subtotal: number;
  discount: number;
  total: number;
  created_by: string | null;
  mp_preference_id: string | null;
  mp_payment_id: string | null;
  paid_at: string | null;
  cancelled_at: string | null;
  refunded_at: string | null;
  meta: Record<string, any>;
  invoice_id?: string | null;
  invoice_cae?: string | null;
  invoice_cae_vto?: string | null;
  created_at: string;
  updated_at: string;
  
  // Relations
  items?: OrderItem[];
}


// Para APIs
export interface CreateProductInput {
  type: ProductType;
  name: string;
  description?: string;
  category_id?: string;
  sku?: string;
  price: number;
  stock_qty?: number | null;
  image_paths?: string[];
  is_active?: boolean;
}

export interface AdjustStockInput {
  delta: number;
  type: StockMovementType;
  note?: string;
}
