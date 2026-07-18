-- Migration: 20260718000005_payout_rpc_jsonb.sql
-- Fix: Implement explicit SQL Rollbacks using a BEGIN/EXCEPTION block to safely catch
-- errors, log SQLSTATE & SQLERRM to payment_audit_log, and return an explicit JSONB payload.

-- Drop old signatures to prevent return-type conflict
DROP FUNCTION IF EXISTS public.request_payout(bigint, text, int);
DROP FUNCTION IF EXISTS public.request_payout(UUID, NUMERIC, TEXT, UUID);

CREATE OR REPLACE FUNCTION public.request_payout(
  p_vendor_id       UUID,
  p_amount          NUMERIC,
  p_method_id       TEXT    DEFAULT NULL,
  p_idempotency_key UUID    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payout_id  UUID;
  v_status     TEXT;
  v_balance    NUMERIC;
  v_payout     public.payouts;
  v_err_msg    TEXT;
  v_status_code INTEGER;
BEGIN
  -- ---- 0. Fast input validation ----
  IF p_amount IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount is strictly required', 'status', 400, 'code', 'P0001');
  END IF;
  
  IF p_idempotency_key IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Idempotency key is strictly required', 'status', 400, 'code', 'P0001');
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Requested amount must be greater than 0';
  END IF;

  -- ---- 1. Atomic idempotency claim ----
  INSERT INTO public.payouts (
    vendor_id, amount, method_id, status, idempotency_key
  )
  VALUES (
    p_vendor_id, p_amount, p_method_id, 'pending', p_idempotency_key
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id, status INTO v_payout_id, v_status;

  IF v_payout_id IS NULL THEN
    SELECT * INTO v_payout
      FROM public.payouts
     WHERE idempotency_key = p_idempotency_key;

    IF p_vendor_id IS DISTINCT FROM v_payout.vendor_id 
       OR p_amount IS DISTINCT FROM v_payout.amount 
       OR p_method_id IS DISTINCT FROM v_payout.method_id THEN
      RAISE EXCEPTION 'Idempotency key collision with mismatched parameters'
        USING ERRCODE = 'P0001';
    END IF;

    IF v_payout.status IN ('failed', 'cancelled', 'rejected') THEN
      RAISE EXCEPTION 'IDEMPOTENCY_TERMINAL'
        USING ERRCODE = 'P0001';
    END IF;

    IF v_payout.status = 'completed' THEN
      RETURN jsonb_build_object('success', true, 'payout', row_to_json(v_payout)::jsonb, 'isIdempotentReplay', true);
    END IF;

    RETURN jsonb_build_object('success', true, 'payout', row_to_json(v_payout)::jsonb);
  END IF;

  -- ---- 3. Lock the vendor row (FOR UPDATE) ----
  SELECT COALESCE(withdrawable_balance, 0)
    INTO v_balance
    FROM public.vendors
   WHERE id = p_vendor_id
     FOR UPDATE;

  IF NOT FOUND THEN
    DELETE FROM public.payouts WHERE id = v_payout_id;
    RAISE EXCEPTION 'Vendor not found';
  END IF;

  -- ---- 4. Sufficient balance check ----
  IF p_amount > v_balance THEN
    DELETE FROM public.payouts WHERE id = v_payout_id;
    RAISE EXCEPTION 'Insufficient balance: requested % but only % available', p_amount, v_balance;
  END IF;

  -- ---- 5. Method IDOR check ----
  IF p_method_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
        FROM public.vendor_payment_setup
       WHERE vendor_id    = p_vendor_id
         AND id::text     = p_method_id
         AND is_completed = TRUE
    ) THEN
      DELETE FROM public.payouts WHERE id = v_payout_id;
      RAISE EXCEPTION 'Unauthorized payment method';
    END IF;
  END IF;

  -- ---- 6. Reserve funds immediately ----
  UPDATE public.vendors
     SET withdrawable_balance = COALESCE(withdrawable_balance, 0) - COALESCE(p_amount, 0)
   WHERE id = p_vendor_id;

  INSERT INTO public.vendor_wallet_ledger (vendor_id, type, amount, description)
  VALUES (
    p_vendor_id,
    'payout_reserved',
    -COALESCE(p_amount, 0),
    'Payout funds reserved (pending payout ' || v_payout_id::text || ')'
  );

  -- ---- 7. Stamp debited_at now that funds are reserved ----
  UPDATE public.payouts
     SET debited_at = now()
   WHERE id = v_payout_id
  RETURNING * INTO v_payout;

  RETURN jsonb_build_object('success', true, 'payout', row_to_json(v_payout)::jsonb);

EXCEPTION WHEN OTHERS THEN
  -- Map error codes to friendly messages
  IF SQLSTATE = '23505' THEN
    v_err_msg := 'Duplicate idempotency key';
    v_status_code := 409;
  ELSIF SQLSTATE = '23503' THEN
    v_err_msg := 'Invalid reference (Foreign Key Violation)';
    v_status_code := 400;
  ELSIF SQLSTATE = 'P0001' THEN
    v_err_msg := SQLERRM;
    IF SQLERRM LIKE '%Idempotency key collision%' OR SQLERRM = 'IDEMPOTENCY_TERMINAL' THEN
      v_status_code := 409;
    ELSE
      v_status_code := 400;
    END IF;
  ELSE
    v_err_msg := SQLERRM;
    v_status_code := 500;
  END IF;

  -- Log the failure to payment_audit_log, satisfying NOT NULL on payment_id using zeroes
  INSERT INTO public.payment_audit_log (payment_id, old_status, new_status, source, metadata)
  VALUES (
    COALESCE(v_payout_id, '00000000-0000-0000-0000-000000000000'::uuid),
    'request_payout',
    'failed',
    'request_payout_rpc',
    jsonb_build_object(
      'sqlstate', SQLSTATE,
      'sqlerrm', SQLERRM,
      'vendor_id', p_vendor_id,
      'amount', p_amount,
      'method_id', p_method_id
    )
  );

  RETURN jsonb_build_object(
    'success', false,
    'error', v_err_msg,
    'status', v_status_code,
    'code', SQLSTATE
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.request_payout(UUID, NUMERIC, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_payout(UUID, NUMERIC, TEXT, UUID) TO service_role;

