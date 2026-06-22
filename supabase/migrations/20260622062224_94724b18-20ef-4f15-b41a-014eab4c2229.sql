
CREATE OR REPLACE FUNCTION public.get_vendor_checkout_name(_vendor_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN v.checkout_display_name = 'bank' AND COALESCE(v.bank_account_holder, '') <> ''
      THEN v.bank_account_holder
    ELSE v.store_name
  END
  FROM public.vendors v
  WHERE v.id = _vendor_id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_vendor_checkout_name(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_vendor_checkout_name(uuid) TO authenticated, service_role;
