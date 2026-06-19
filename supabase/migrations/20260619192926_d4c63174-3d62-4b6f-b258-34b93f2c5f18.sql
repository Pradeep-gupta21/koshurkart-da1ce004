
-- 1. Reviews: prevent user-side tampering with moderation fields
CREATE OR REPLACE FUNCTION public.prevent_review_moderation_tampering()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admins can change anything
  IF public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  -- Non-admin users cannot modify moderation columns
  IF NEW.is_suspicious IS DISTINCT FROM OLD.is_suspicious
     OR NEW.moderation_status IS DISTINCT FROM OLD.moderation_status
     OR NEW.flagged_reason IS DISTINCT FROM OLD.flagged_reason
     OR NEW.is_verified_purchase IS DISTINCT FROM OLD.is_verified_purchase
     OR NEW.helpful_count IS DISTINCT FROM OLD.helpful_count THEN
    RAISE EXCEPTION 'Not authorized to modify moderation fields';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_review_moderation_tampering ON public.reviews;
CREATE TRIGGER trg_prevent_review_moderation_tampering
  BEFORE UPDATE ON public.reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_review_moderation_tampering();

-- 2. Orders: hide courier_api_config from anon/authenticated reads
REVOKE SELECT (courier_api_config) ON public.orders FROM anon, authenticated;

-- 3. Payments: replace permissive vendor SELECT policy with a safe RPC
DROP POLICY IF EXISTS "Vendors read order payments" ON public.payments;

CREATE OR REPLACE FUNCTION public.get_vendor_payments(
  _vendor_id uuid,
  _since timestamptz DEFAULT NULL,
  _limit integer DEFAULT 100
)
RETURNS TABLE (
  id uuid,
  order_id uuid,
  amount numeric,
  vendor_earnings numeric,
  payment_status text,
  payment_method text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = _vendor_id AND v.user_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT DISTINCT p.id, p.order_id, p.amount, p.vendor_earnings,
                  p.payment_status, p.payment_method, p.created_at
  FROM public.payments p
  JOIN public.order_items oi ON oi.order_id = p.order_id
  WHERE oi.vendor_id = _vendor_id
    AND (_since IS NULL OR p.created_at >= _since)
  ORDER BY p.created_at DESC
  LIMIT _limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_vendor_payments(uuid, timestamptz, integer) TO authenticated;
