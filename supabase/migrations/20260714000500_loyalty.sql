-- Migration: loyalty — discount coupons the agent can apply, plus birthday
-- automation support. Birthdays live in contacts.custom_fields.birthday (same
-- field the campaign segment reads), so no new contact column is needed here.

CREATE TABLE IF NOT EXISTS public.coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percent', 'amount')),
  discount_value NUMERIC(12,2) NOT NULL CHECK (discount_value > 0),
  min_order_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  max_uses INT,                       -- NULL = unlimited
  uses INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Codes are matched case-insensitively; store uppercased and key on that.
  UNIQUE (workspace_id, code)
);

CREATE INDEX IF NOT EXISTS idx_coupons_ws_active
  ON public.coupons(workspace_id) WHERE active = TRUE;

CREATE TRIGGER trg_coupons_updated_at
  BEFORE UPDATE ON public.coupons
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws members read coupons" ON public.coupons
  FOR SELECT USING (workspace_id IN (SELECT auth_workspace_ids()));
CREATE POLICY "ws admins manage coupons" ON public.coupons
  FOR ALL USING (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager']::workspace_role[])
  ) WITH CHECK (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager']::workspace_role[])
  );

-- Atomic, capacity-checked redemption. Increments uses only when the coupon is
-- still active, unexpired and under max_uses. Returns true when redeemed.
CREATE OR REPLACE FUNCTION public.redeem_coupon(p_coupon_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ok BOOLEAN;
BEGIN
  UPDATE public.coupons
  SET uses = uses + 1
  WHERE id = p_coupon_id
    AND active = TRUE
    AND (expires_at IS NULL OR expires_at > now())
    AND (max_uses IS NULL OR uses < max_uses)
  RETURNING TRUE INTO v_ok;

  RETURN COALESCE(v_ok, FALSE);
END;
$$;
