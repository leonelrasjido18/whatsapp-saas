-- ============================================================
-- Migration: 20260712000600_commerce_contacts_and_invoices
-- Add persistent CRM classification columns to contacts
-- Create a robust invoices table to track AFIP vouchers
-- ============================================================

-- 1. Add CRM classification columns to contacts
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS customer_tier TEXT DEFAULT 'new' CHECK (customer_tier IN ('new', 'regular', 'vip', 'inactive')),
  ADD COLUMN IF NOT EXISTS total_spent NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_purchase_at TIMESTAMPTZ;

-- 2. Create invoices table
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  
  -- Fiscal details
  invoice_type TEXT NOT NULL CHECK (invoice_type IN ('C', 'B', 'A')),
  point_of_sale INTEGER NOT NULL,
  voucher_number INTEGER NOT NULL,
  
  -- CAE (Código de Autorización Electrónico)
  cae TEXT NOT NULL,
  cae_expires_at DATE NOT NULL,
  
  -- Receptor (optional for C < threshold, required for A/B)
  doc_type INTEGER, -- 99 = Consumidor Final, 80 = CUIT
  doc_number TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Unique constraint per workspace+ptoVta+voucher (fiscal uniqueness)
  UNIQUE(workspace_id, point_of_sale, voucher_number, invoice_type),
  -- One invoice per order (for now)
  UNIQUE(order_id)
);

-- RLS for invoices
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoices_workspace_isolation"
  ON public.invoices
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.memberships 
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- ============================================================
-- End of migration
-- ============================================================
