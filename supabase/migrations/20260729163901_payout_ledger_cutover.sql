-- =============================================================================
-- Migration: 20260729163901_payout_ledger_cutover.sql
-- Description: Cutover payout lifecycle to ledger-first architecture
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Pre-Flight Audit: Assert Zero Inflight Legacy Payouts
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_non_terminal_count INT;
BEGIN
  -- Assert that ALL payouts in the system are in a known terminal state
  -- before permitting the ledger-first architecture to take control.
  SELECT COUNT(*) INTO v_non_terminal_count
    FROM public.payouts
   WHERE status NOT IN ('completed', 'failed', 'rejected', 'cancelled');

  IF v_non_terminal_count > 0 THEN
    RAISE EXCEPTION 'MIGRATION ABORTED: % inflight legacy payouts detected in non-terminal states. All payouts must be resolved to terminal states before ledger cutover.', v_non_terminal_count;
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. Drop obsolete legacy trigger
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_debit_balance_on_payout_complete ON public.payouts;

-- -----------------------------------------------------------------------------
-- 3. Canonical RPC: request_payout (BIGINT / Paise)
-- -----------------------------------------------------------------------------
-- Drops old signatures to avoid conflicts
DROP FUNCTION IF EXISTS public.request_payout(UUID, NUMERIC, TEXT, UUID);

CREATE OR REPLACE FUNCTION public.request_payout(
  p_vendor_id       UUID,
  p_amount_paise    BIGINT,
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
  IF p_amount_paise IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount is strictly required', 'status', 400, 'code', 'P0001');
  END IF;
  
  IF p_idempotency_key IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Idempotency key is strictly required', 'status', 400, 'code', 'P0001');
  END IF;

  IF p_amount_paise <= 0 THEN
    RAISE EXCEPTION 'Requested amount must be greater than 0';
  END IF;

  -- ---- 1. Atomic idempotency claim on payouts table ----
  -- Note: We still insert the numeric amount into payouts.amount to satisfy the 
  -- schema, but we treat it functionally as paise for new rows.
  INSERT INTO public.payouts (
    vendor_id, amount, method_id, status, idempotency_key
  )
  VALUES (
    p_vendor_id, p_amount_paise::numeric, p_method_id, 'pending', p_idempotency_key
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id, status INTO v_payout_id, v_status;

  IF v_payout_id IS NULL THEN
    -- Duplicate key: return existing
    SELECT * INTO v_payout
      FROM public.payouts
     WHERE idempotency_key = p_idempotency_key;

    IF p_vendor_id IS DISTINCT FROM v_payout.vendor_id 
       OR p_amount_paise::numeric IS DISTINCT FROM v_payout.amount 
       OR p_method_id IS DISTINCT FROM v_payout.method_id THEN
      RAISE EXCEPTION 'Idempotency key collision with mismatched parameters'
        USING ERRCODE = 'P0001';
    END IF;

    IF v_payout.status IN ('failed', 'cancelled', 'rejected') THEN
      RAISE EXCEPTION 'IDEMPOTENCY_TERMINAL'
        USING ERRCODE = 'P0001';
    END IF;

    IF v_payout.status = 'completed' THEN
      RETURN jsonb_build_object('success', true, 'payoutId', v_payout.id, 'payout', row_to_json(v_payout)::jsonb, 'isIdempotentReplay', true);
    END IF;

    RETURN jsonb_build_object('success', true, 'payoutId', v_payout.id, 'payout', row_to_json(v_payout)::jsonb);
  END IF;

  -- ---- 2. Lock the vendor row (FOR UPDATE) ----
  SELECT COALESCE(withdrawable_balance, 0)
    INTO v_balance
    FROM public.vendors
   WHERE id = p_vendor_id
     FOR UPDATE;

  IF NOT FOUND THEN
    DELETE FROM public.payouts WHERE id = v_payout_id;
    RAISE EXCEPTION 'Vendor not found';
  END IF;

  -- ---- 3. Sufficient balance check ----
  -- Compares paise to paise (since projection trigger now yields paise)
  IF p_amount_paise > v_balance THEN
    DELETE FROM public.payouts WHERE id = v_payout_id;
    RAISE EXCEPTION 'Insufficient balance: requested % but only % available', p_amount_paise, v_balance;
  END IF;

  -- ---- 4. Method IDOR check ----
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

  -- ---- 5. Stamp debited_at (Legacy API compatibility for UI) ----
  UPDATE public.payouts
     SET debited_at = now()
   WHERE id = v_payout_id
  RETURNING * INTO v_payout;

  -- ---- 6. Insert Canonical Ledger Entry ----
  -- This insertion will fire the projection trigger, which automatically locks the vendor row.
  -- Because we already acquired the lock in Step 2, this is deadlock-free.
  INSERT INTO public.ledger_entries (
    vendor_id, 
    payout_id, 
    type, 
    status, 
    amount_paise, 
    operation_key
  )
  VALUES (
    p_vendor_id,
    v_payout_id,
    'payout',
    'pending',
    p_amount_paise,
    'payout:' || v_payout_id::text
  );

  RETURN jsonb_build_object('success', true, 'payoutId', v_payout_id, 'payout', row_to_json(v_payout)::jsonb);

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
      'amount_paise', p_amount_paise,
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

REVOKE EXECUTE ON FUNCTION public.request_payout(UUID, BIGINT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_payout(UUID, BIGINT, TEXT, UUID) TO service_role;


-- -----------------------------------------------------------------------------
-- 4. Rollout Compatibility Wrapper: request_payout (NUMERIC / Rupees)
-- -----------------------------------------------------------------------------
-- Exists solely to prevent downtime while Edge Functions are deployed.
-- Edge Functions currently send `NUMERIC` rupees. This wrapper catches those,
-- multiplies by 100, and forwards to the new canonical `BIGINT` signature.
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
BEGIN
  -- Forward to the canonical BIGINT signature, applying the rupee->paise conversion
  RETURN public.request_payout(
    p_vendor_id,
    ROUND(p_amount * 100)::BIGINT,
    p_method_id,
    p_idempotency_key
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.request_payout(UUID, NUMERIC, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_payout(UUID, NUMERIC, TEXT, UUID) TO service_role;


-- -----------------------------------------------------------------------------
-- 5. Rollback RPC
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rollback_vendor_payout(
  p_payout_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payout public.payouts;
  v_row_count INT;
BEGIN
  -- Lock and fetch the payout row.
  SELECT * INTO v_payout
    FROM public.payouts
   WHERE id = p_payout_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payout % not found', p_payout_id;
  END IF;

  IF v_payout.status <> 'pending' THEN
    RAISE EXCEPTION 'Cannot rollback payout % with status %',
      p_payout_id, v_payout.status
      USING HINT = 'Only pending payouts can be rolled back';
  END IF;

  -- Mark as failed in payouts table.
  UPDATE public.payouts
     SET status     = 'failed',
         updated_at = now()
   WHERE id = p_payout_id;

  -- Delegate financial balance restoration entirely to the ledger.
  UPDATE public.ledger_entries 
     SET status = 'failed' 
   WHERE operation_key = 'payout:' || p_payout_id::text;

  -- Strict exactly-one assertion
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  
  IF v_row_count = 0 THEN
    RAISE EXCEPTION 'CORRUPTION: Missing ledger entry for post-cutover payout %', p_payout_id;
  ELSIF v_row_count > 1 THEN
    RAISE EXCEPTION 'CORRUPTION: Multiple ledger entries detected for payout %', p_payout_id;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rollback_vendor_payout(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rollback_vendor_payout(UUID) TO service_role;


-- -----------------------------------------------------------------------------
-- 6. Admin Update RPC
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_payout_status(
  p_payout_id UUID,
  p_new_status TEXT
)
RETURNS public.payouts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payout public.payouts;
  v_old_status text;
  v_ledger_status public.ledger_entry_status;
  v_row_count INT;
BEGIN
  -- Authorization
  IF auth.role() = 'service_role' THEN
    NULL;
  ELSIF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Unauthorized: Only admins or service_role can update payout status';
  END IF;

  -- Row lock
  SELECT * INTO v_payout
    FROM public.payouts
   WHERE id = p_payout_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payout not found';
  END IF;

  v_old_status := v_payout.status;

  IF v_old_status IN ('completed', 'rejected', 'failed', 'cancelled') THEN
    RAISE EXCEPTION 'Cannot mutate a payout in a terminal state (current: %)', v_old_status;
  END IF;

  IF p_new_status = 'processing' THEN
    IF v_old_status <> 'pending' THEN
      RAISE EXCEPTION 'Invalid payout state transition';
    END IF;
  ELSIF p_new_status = 'completed' THEN
    IF v_old_status <> 'processing' THEN
      RAISE EXCEPTION 'Invalid payout state transition';
    END IF;
  ELSIF p_new_status IN ('rejected', 'cancelled', 'failed') THEN
    IF v_old_status NOT IN ('pending', 'processing') THEN
      RAISE EXCEPTION 'Invalid payout state transition';
    END IF;
  ELSE
    RAISE EXCEPTION 'Invalid payout state transition';
  END IF;

  -- Apply the status transition to payouts
  UPDATE public.payouts
     SET status = p_new_status,
         updated_at = now()
   WHERE id = p_payout_id
  RETURNING * INTO v_payout;

  -- Explicit Status Mapping
  IF p_new_status IN ('pending', 'processing') THEN
    v_ledger_status := 'pending'::public.ledger_entry_status;
  ELSIF p_new_status = 'completed' THEN
    v_ledger_status := 'confirmed'::public.ledger_entry_status;
  ELSIF p_new_status IN ('failed', 'rejected', 'cancelled') THEN
    v_ledger_status := 'failed'::public.ledger_entry_status;
  ELSE
    RAISE EXCEPTION 'Unknown payout status mapping: %', p_new_status;
  END IF;

  -- Apply the status transition to ledger_entries
  UPDATE public.ledger_entries 
     SET status = v_ledger_status 
   WHERE operation_key = 'payout:' || p_payout_id::text;

  -- Strict exactly-one assertion
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  
  IF v_row_count = 0 THEN
    RAISE EXCEPTION 'CORRUPTION: Missing ledger entry for post-cutover payout %', p_payout_id;
  ELSIF v_row_count > 1 THEN
    RAISE EXCEPTION 'CORRUPTION: Multiple ledger entries detected for payout %', p_payout_id;
  END IF;

  RETURN v_payout;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_update_payout_status(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_payout_status(UUID, TEXT) TO authenticated, service_role;
