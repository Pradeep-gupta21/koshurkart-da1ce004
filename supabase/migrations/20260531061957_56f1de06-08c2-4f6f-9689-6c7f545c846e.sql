
-- Column-level security on vendors: revoke sensitive columns from anon/authenticated
-- and expose them through SECURITY DEFINER RPCs gated by ownership / admin role.

REVOKE SELECT (
  phone, phone_verified_at,
  pickup_address_line1, pickup_address_line2, pickup_pincode,
  business_name, business_type, gstin, pan_number, aadhaar_last4,
  bank_account_holder, bank_account_number_masked, bank_ifsc, bank_verified,
  kyc_status, kyc_doc_business, kyc_doc_address, kyc_doc_pan,
  kyc_rejection_reason, kyc_reviewed_at, kyc_submitted_at,
  total_earnings, withdrawable_balance,
  verification_rejection_reason
) ON public.vendors FROM anon, authenticated;

-- Owner: returns the caller's own vendor row (all columns).
CREATE OR REPLACE FUNCTION public.get_my_vendor()
RETURNS SETOF public.vendors
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.vendors WHERE user_id = auth.uid();
$$;

-- Admin: full vendor row by id.
CREATE OR REPLACE FUNCTION public.get_vendor_admin(_vendor_id uuid)
RETURNS SETOF public.vendors
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY SELECT * FROM public.vendors WHERE id = _vendor_id;
END;
$$;

-- Admin: list vendors with optional filters.
CREATE OR REPLACE FUNCTION public.list_vendors_admin(
  _search text DEFAULT NULL,
  _status text DEFAULT NULL,
  _limit int DEFAULT 200,
  _offset int DEFAULT 0
)
RETURNS SETOF public.vendors
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY
    SELECT * FROM public.vendors
    WHERE (_status IS NULL OR verification_status = _status)
      AND (_search IS NULL OR _search = '' OR store_name ILIKE '%' || _search || '%')
    ORDER BY created_at DESC
    LIMIT _limit OFFSET _offset;
END;
$$;

-- Owner or admin: financial summary for one vendor.
CREATE OR REPLACE FUNCTION public.get_vendor_financials(_vendor_id uuid)
RETURNS TABLE (total_earnings numeric, withdrawable_balance numeric, total_sales integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.vendors WHERE id = _vendor_id AND user_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY
    SELECT v.total_earnings, v.withdrawable_balance, v.total_sales
    FROM public.vendors v WHERE v.id = _vendor_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_vendor() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_vendor_admin(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.list_vendors_admin(text, text, int, int) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_vendor_financials(uuid) FROM anon, public;

GRANT EXECUTE ON FUNCTION public.get_my_vendor() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_vendor_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_vendors_admin(text, text, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_vendor_financials(uuid) TO authenticated;
