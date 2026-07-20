-- Payment Setup Completion Flow
-- Adds vendor_payment_setup table and payment_setup_completed flag on vendors.
-- Fixes: #10 (atomicity), #12 (RLS masking), #13 (CHECK constraints)

-- 1. New table: vendor_payment_setup
CREATE TABLE IF NOT EXISTS public.vendor_payment_setup (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL UNIQUE REFERENCES public.vendors(id) ON DELETE CASCADE,
  payment_destination_type TEXT NOT NULL CHECK (payment_destination_type IN ('ifsc_account', 'upi_id', 'both')),
  ifsc_code TEXT,
  account_number TEXT,
  account_holder_name TEXT,
  upi_id TEXT,
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- #13: Require account_number when payment_destination_type involves IFSC
  CONSTRAINT check_ifsc_requires_account CHECK (
    (payment_destination_type NOT IN ('ifsc_account', 'both')) OR account_number IS NOT NULL
  ),

  -- #13: Require upi_id when payment_destination_type involves UPI
  CONSTRAINT check_upi_requires_upi_id CHECK (
    (payment_destination_type NOT IN ('upi_id', 'both')) OR upi_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_vendor_payment_setup_vendor_id ON public.vendor_payment_setup(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_payment_setup_is_completed ON public.vendor_payment_setup(is_completed);

-- Grants
GRANT SELECT, INSERT, UPDATE ON public.vendor_payment_setup TO authenticated;
GRANT ALL ON public.vendor_payment_setup TO service_role;

-- RLS
ALTER TABLE public.vendor_payment_setup ENABLE ROW LEVEL SECURITY;

-- #12: Policy 1 — Vendors can only SELECT their own record.
-- Sensitive columns (account_number, ifsc_code, upi_id) are accessible here but
-- the client never queries this table directly — all vendor reads go through the
-- Edge Function (service_role) which returns only safe fields.
-- This policy exists as a safety net for direct client queries.
CREATE POLICY "vendors_read_own_setup" ON public.vendor_payment_setup
  FOR SELECT USING (
    vendor_id IN (SELECT id FROM public.vendors WHERE user_id = auth.uid())
  );

-- Policy 2 — Vendors can INSERT their own payment setup
CREATE POLICY "vendors_insert_own_setup" ON public.vendor_payment_setup
  FOR INSERT WITH CHECK (
    vendor_id IN (SELECT id FROM public.vendors WHERE user_id = auth.uid())
  );

-- Policy 3 — Vendors can UPDATE their own payment setup
CREATE POLICY "vendors_update_own_setup" ON public.vendor_payment_setup
  FOR UPDATE USING (
    vendor_id IN (SELECT id FROM public.vendors WHERE user_id = auth.uid())
  );

-- #12: Policy 4 — Admins can SELECT all records (all columns for audit dashboard)
CREATE POLICY "admins_read_all_setup" ON public.vendor_payment_setup
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Policy 5 — Admins can UPDATE all records
CREATE POLICY "admins_update_all_setup" ON public.vendor_payment_setup
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- 2. New columns on vendors table
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS payment_setup_completed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS payment_setup_completed_at TIMESTAMPTZ;

-- 3. #10: Atomic RPC function — upserts vendor_payment_setup AND updates vendors in one transaction
CREATE OR REPLACE FUNCTION public.upsert_vendor_payment_setup_atomic(
  p_vendor_id uuid,
  p_payment_destination_type text,
  p_ifsc_code text DEFAULT NULL,
  p_account_number text DEFAULT NULL,
  p_account_holder_name text DEFAULT NULL,
  p_upi_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_setup_id uuid;
BEGIN
  -- Defensive server-side validation (redundant to CHECK constraints, but defensive)
  IF p_payment_destination_type NOT IN ('ifsc_account', 'upi_id', 'both') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid payment_destination_type');
  END IF;

  IF p_payment_destination_type IN ('ifsc_account', 'both') AND (p_account_number IS NULL OR p_account_number = '') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Account number is required for IFSC payment type');
  END IF;

  IF p_payment_destination_type IN ('upi_id', 'both') AND (p_upi_id IS NULL OR p_upi_id = '') THEN
    RETURN jsonb_build_object('success', false, 'error', 'UPI ID is required for UPI payment type');
  END IF;

  -- Upsert vendor_payment_setup
  INSERT INTO public.vendor_payment_setup (
    vendor_id,
    payment_destination_type,
    ifsc_code,
    account_number,
    account_holder_name,
    upi_id,
    is_completed,
    completed_at,
    updated_at
  ) VALUES (
    p_vendor_id,
    p_payment_destination_type,
    p_ifsc_code,
    p_account_number,
    p_account_holder_name,
    p_upi_id,
    TRUE,
    NOW(),
    NOW()
  )
  ON CONFLICT (vendor_id) DO UPDATE SET
    payment_destination_type = EXCLUDED.payment_destination_type,
    ifsc_code = EXCLUDED.ifsc_code,
    account_number = EXCLUDED.account_number,
    account_holder_name = EXCLUDED.account_holder_name,
    upi_id = EXCLUDED.upi_id,
    is_completed = TRUE,
    completed_at = NOW(),
    updated_at = NOW()
  RETURNING id INTO v_setup_id;

  -- Update vendors table atomically (same transaction)
  UPDATE public.vendors
  SET
    payment_setup_completed = TRUE,
    payment_setup_completed_at = NOW()
  WHERE id = p_vendor_id;

  RETURN jsonb_build_object(
    'success', true,
    'setup_id', v_setup_id,
    'message', 'Payment setup saved successfully'
  );
END;
$$;

-- Grant execute to service_role (edge functions use this)
GRANT EXECUTE ON FUNCTION public.upsert_vendor_payment_setup_atomic TO service_role;

-- 4. Backfill existing vendors who already have payment destinations
UPDATE public.vendors
SET
  payment_setup_completed = TRUE,
  payment_setup_completed_at = NOW()
WHERE verification_status = 'verified'
  AND payment_setup_completed = FALSE
  AND (
    (bank_ifsc IS NOT NULL AND bank_ifsc != '' AND bank_account_number_masked IS NOT NULL AND bank_account_number_masked != '')
    OR (direct_upi_id IS NOT NULL AND direct_upi_id != '')
  );

-- Also create vendor_payment_setup rows for backfilled vendors
INSERT INTO public.vendor_payment_setup (vendor_id, payment_destination_type, ifsc_code, account_holder_name, upi_id, is_completed, completed_at)
SELECT
  v.id,
  CASE
    WHEN (v.bank_ifsc IS NOT NULL AND v.bank_ifsc != '') AND (v.direct_upi_id IS NOT NULL AND v.direct_upi_id != '') THEN 'both'
    WHEN (v.bank_ifsc IS NOT NULL AND v.bank_ifsc != '') THEN 'ifsc_account'
    ELSE 'upi_id'
  END,
  v.bank_ifsc,
  v.bank_account_holder,
  v.direct_upi_id,
  TRUE,
  NOW()
FROM public.vendors v
WHERE v.payment_setup_completed = TRUE
  AND NOT EXISTS (SELECT 1 FROM public.vendor_payment_setup vps WHERE vps.vendor_id = v.id)
ON CONFLICT (vendor_id) DO NOTHING;
