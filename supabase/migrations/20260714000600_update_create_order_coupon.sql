-- Migration: expose the coupon_code parameter on the create_order tool schema
-- so the agent knows it can apply a discount coupon at checkout.

UPDATE public.tools
SET schema = '{"type":"object","properties":{"items":{"type":"array","items":{"type":"object","properties":{"product_id":{"type":"string","format":"uuid"},"qty":{"type":"integer","minimum":1}},"required":["product_id","qty"]},"minItems":1},"note":{"type":"string"},"coupon_code":{"type":"string","description":"Código de cupón de descuento si el cliente tiene uno."}},"required":["items"]}'
WHERE key = 'create_order';
