-- Migration: 20260718000007_rpc_security_hardening.sql
-- Implements Zero-Trust Security Definer, Explicit Null Rejection, and robust idempotency.

-- Drop old signatures to prevent return-type conflict
DROP FUNCTION IF EXISTS public.request_payout(bigint, text, int);
DROP FUNCTION IF EXISTS public.request_payout(UUID, NUMERIC, TEXT, UUID);
DROP FUNCTION IF EXISTS public.vendor_approve_return(uuid);
DROP FUNCTION IF EXISTS public.vendor_approve_return(uuid, uuid);

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

    -- Explicit Null Rejection
    IF v_payout.status IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Idempotent payload found but status is null', 'status', 500, 'code', 'P0001');
    END IF;

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

    IF v_payout.status IN ('processing', 'completed') THEN
      -- Return payoutId explicitly and isIdempotentReplay flag
      RETURN jsonb_build_object('success', true, 'payoutId', v_payout.id, 'payout', row_to_json(v_payout)::jsonb, 'isIdempotentReplay', true);
    END IF;

    RETURN jsonb_build_object('success', true, 'payoutId', v_payout.id, 'payout', row_to_json(v_payout)::jsonb);
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

CREATE OR REPLACE FUNCTION public.vendor_approve_return(_order_item_id uuid, _caller_vendor_id uuid)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _vendor_id   uuid;
  _order_id    uuid;
  _price       numeric;
  _qty         integer;
  _status      text;
  _title       text;
  _amount      numeric;
  _payment     record;
  _total_items numeric;
  _new_balance numeric;
BEGIN
  -- 0. Zero-Trust Security Definer: explicitly lookup vendor ID before any status leak.
  SELECT oi.vendor_id INTO _vendor_id
  FROM public.order_items oi
  WHERE oi.id = _order_item_id;

  IF _vendor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order item not found', 'status', 404, 'code', 'P0001');
  END IF;

  IF _vendor_id IS DISTINCT FROM _caller_vendor_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized', 'status', 403, 'code', 'P0001');
  END IF;

  -- 1. Explicit Null Rejection on state
  SELECT oi.return_status INTO _status
  FROM public.order_items oi
  WHERE oi.id = _order_item_id;

  IF _status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Return status is null', 'status', 400, 'code', 'P0001');
  END IF;

  IF _status = 'processing' THEN
    RETURN jsonb_build_object('success', true, 'isIdempotentReplay', true);
  END IF;

  IF _status = 'approved' THEN
    IF EXISTS (
      SELECT 1 FROM public.vendor_wallet_ledger
      WHERE order_item_id = _order_item_id AND type = 'overdraft_acknowledged'
    ) THEN
      RETURN jsonb_build_object('success', true, 'status', 'pending', 'isIdempotentReplay', true);
    ELSE
      RETURN jsonb_build_object('success', true, 'isIdempotentReplay', true);
    END IF;
  END IF;

  IF _status <> 'requested' THEN
    RETURN jsonb_build_object('success', false, 'error', 'RETURN_NOT_PENDING', 'status', 409, 'code', 'P0001');
  END IF;

  -- Row-level lock: serialises concurrent calls so the balance deduction
  -- cannot run twice for the same item.
  SELECT oi.order_id, oi.price, oi.quantity, oi.return_status, oi.title
    INTO _order_id, _price, _qty, _status, _title
  FROM public.order_items oi
  WHERE oi.id = _order_item_id
  FOR UPDATE;

  -- Explicit Null Rejection inside the lock
  IF _status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Return status is null', 'status', 400, 'code', 'P0001');
  END IF;

  IF _status = 'processing' THEN
    RETURN jsonb_build_object('success', true, 'isIdempotentReplay', true);
  END IF;

  -- Re-check the status inside the FOR UPDATE lock
  IF _status = 'approved' THEN
    IF EXISTS (
      SELECT 1 FROM public.vendor_wallet_ledger
      WHERE order_item_id = _order_item_id AND type = 'overdraft_acknowledged'
    ) THEN
      RETURN jsonb_build_object('success', true, 'status', 'pending', 'isIdempotentReplay', true);
    ELSE
      RETURN jsonb_build_object('success', true, 'isIdempotentReplay', true);
    END IF;
  END IF;

  IF _status <> 'requested' THEN
    RETURN jsonb_build_object('success', false, 'error', 'RETURN_NOT_PENDING', 'status', 409, 'code', 'P0001');
  END IF;

  SELECT * INTO _payment
  FROM public.payments
  WHERE order_id = _order_id AND credited_at IS NOT NULL
  LIMIT 1;

  SELECT SUM(price * quantity) INTO _total_items
  FROM public.order_items WHERE order_id = _order_id;

  _amount := COALESCE(
    (COALESCE(_payment.vendor_earnings, _payment.amount)
     * (COALESCE(_price, 0) * COALESCE(_qty, 0)))
    / NULLIF(_total_items, 0),
    0
  );

  UPDATE public.order_items
     SET return_status = 'approved'
   WHERE id = _order_item_id;

  UPDATE public.vendors
     SET total_earnings       = COALESCE(total_earnings, 0) - _amount,
         withdrawable_balance = COALESCE(withdrawable_balance, 0) - _amount
   WHERE id = _vendor_id
   RETURNING withdrawable_balance INTO _new_balance;

  IF _new_balance < 0 THEN
    INSERT INTO public.vendor_wallet_ledger
      (vendor_id, order_id, order_item_id, type, amount, description)
    VALUES
      (_vendor_id, _order_id, _order_item_id, 'overdraft_acknowledged', -_amount,
       'Overdraft acknowledged for return "' || COALESCE(_title, 'item') || '"');
    
    RETURN jsonb_build_object('success', true, 'status', 'pending');
  END IF;

  INSERT INTO public.vendor_wallet_ledger
    (vendor_id, order_id, order_item_id, type, amount, description)
  VALUES
    (_vendor_id, _order_id, _order_item_id, 'return_deduction', -_amount,
     'Return approved for "' || COALESCE(_title, 'item') || '"');

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.vendor_approve_return(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vendor_approve_return(uuid, uuid) TO service_role;
