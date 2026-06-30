
-- 1. Relax payout validation: allow KYC=pending if vendor has live sales.
CREATE OR REPLACE FUNCTION public.validate_payout_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _vendor record;
BEGIN
  IF NEW.amount IS NULL OR NEW.amount <= 0 THEN
    RAISE EXCEPTION 'Payout amount must be greater than zero';
  END IF;

  SELECT withdrawable_balance, bank_verified, kyc_status, total_sales
  INTO _vendor
  FROM public.vendors
  WHERE id = NEW.vendor_id;

  IF _vendor IS NULL THEN
    RAISE EXCEPTION 'Vendor not found';
  END IF;

  -- KYC: approved is always fine; pending is OK if vendor already has live sales.
  IF _vendor.kyc_status NOT IN ('approved','pending') THEN
    RAISE EXCEPTION 'KYC must be approved before requesting a payout';
  END IF;
  IF _vendor.kyc_status = 'pending' AND COALESCE(_vendor.total_sales, 0) <= 0 THEN
    RAISE EXCEPTION 'KYC must be approved before requesting a payout';
  END IF;

  -- Bank required only when KYC fully approved (pending-with-sales path skips it).
  IF _vendor.kyc_status = 'approved' AND _vendor.bank_verified IS NOT TRUE THEN
    RAISE EXCEPTION 'Bank account must be verified before requesting a payout';
  END IF;

  IF NEW.amount > COALESCE(_vendor.withdrawable_balance, 0) THEN
    RAISE EXCEPTION 'Insufficient withdrawable balance (available: %)', COALESCE(_vendor.withdrawable_balance, 0);
  END IF;

  RETURN NEW;
END;
$function$;

-- 2. Dedicated payout_requests ledger for vendor-initiated requests.
CREATE TABLE IF NOT EXISTS public.payout_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'Requested',
  notes text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

GRANT SELECT, INSERT ON public.payout_requests TO authenticated;
GRANT ALL ON public.payout_requests TO service_role;

ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vendor reads own payout requests" ON public.payout_requests
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Vendor inserts own payout requests" ON public.payout_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.user_id = auth.uid())
  );

CREATE POLICY "Admin updates payout requests" ON public.payout_requests
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 3. Direct influencer UPI fields on vendors.
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS direct_upi_id text,
  ADD COLUMN IF NOT EXISTS direct_upi_qr_url text;

-- 4. Public RPC to expose only the fields needed at checkout (since vendors columns are mostly RLS-revoked).
CREATE OR REPLACE FUNCTION public.get_vendor_direct_checkout(_vendor_id uuid)
RETURNS TABLE(
  is_commission_exempt boolean,
  direct_upi_id text,
  direct_upi_qr_url text,
  store_name text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT v.is_commission_exempt, v.direct_upi_id, v.direct_upi_qr_url, v.store_name
  FROM public.vendors v
  WHERE v.id = _vendor_id;
$function$;

GRANT EXECUTE ON FUNCTION public.get_vendor_direct_checkout(uuid) TO anon, authenticated;
