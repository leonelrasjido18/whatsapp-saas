-- FASE 6: Facturación ARCA (AFIP SDK)

-- Agregamos credenciales de facturación electrónica a workspaces
ALTER TABLE workspaces 
  ADD COLUMN afip_cuit TEXT,
  ADD COLUMN afip_pto_vta INTEGER,
  ADD COLUMN afip_cert TEXT, -- Certificado CRT en base64 o texto
  ADD COLUMN afip_key TEXT,  -- Clave privada en base64 o texto
  ADD COLUMN afip_production BOOLEAN DEFAULT FALSE; -- True para prod, false para homologación

-- Agregamos campos a las órdenes para guardar el comprobante
ALTER TABLE orders 
  ADD COLUMN invoice_id TEXT, -- Puede ser "00002-00000004" (Pto Vta - Nro Comprobante)
  ADD COLUMN invoice_cae TEXT,
  ADD COLUMN invoice_cae_vto TIMESTAMP WITH TIME ZONE;
