CREATE OR REPLACE FUNCTION public.create_payment_confirm(p_payment_id uuid, p_order_id uuid, p_razorpay_payment_id text DEFAULT NULL::text, p_razorpay_signature text DEFAULT NULL::text, p_customer_id uuid DEFAULT NULL::uuid, p_is_admin boolean DEFAULT false, p_transaction_id text DEFAULT NULL::text, p_is_webhook boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  -- --------------------------------------------------------------------
  -- Payment lookup
  -- --------------------------------------------------------------------
  v_payment_row                RECORD;

  -- --------------------------------------------------------------------
  -- Order lookup
  -- --------------------------------------------------------------------
  v_order_row                  RECORD;

  -- --------------------------------------------------------------------
  -- Ledger lookup
  -- --------------------------------------------------------------------
  v_ledger_pending_count         INTEGER;
  v_ledger_confirmed             BOOLEAN;
  
  -- --------------------------------------------------------------------
  -- Update tracking
  -- --------------------------------------------------------------------
  v_payment_rows_updated         INTEGER;
  v_order_rows_updated           INTEGER;
  v_ledger_rows_updated          INTEGER;

  -- --------------------------------------------------------------------
  -- Idempotency / replay handling
  -- --------------------------------------------------------------------
  v_is_idempotent_replay        BOOLEAN := FALSE;
  v_replay_data                  JSONB;
  
  -- Replay Hydration Variables
  v_order_status                 TEXT;
  v_amount_paise                 BIGINT;
  v_razorpay_payment_id          TEXT;
  v_operation_key                TEXT;
  v_operation_key_count          INTEGER;
  v_credited_at                  TIMESTAMPTZ;
  
  v_expected_vendor_count        INTEGER;
  v_vendor_rows_updated          INTEGER;

  -- --------------------------------------------------------------------
  -- Timestamps
  -- --------------------------------------------------------------------
  v_now                        TIMESTAMPTZ := now();

  -- --------------------------------------------------------------------
  -- Response construction
  -- --------------------------------------------------------------------
  v_response                    JSONB;

BEGIN

  -- ==========================================================================
  -- 1. AUTHORIZATION
  -- ==========================================================================
  -- This RPC is service_role-only (see GRANT below) and is invoked
  -- exclusively by trusted Edge Functions, never directly by a client.
  -- There is no caller-identity resolution step here — service_role
  -- execution is itself the authorization boundary (Core P1, §4).
  -- Zero-trust applies instead to the *data*: ownership of the payment,
  -- order, and customer relationship is verified entirely through
  -- database lookups in Section 2, never assumed from the parameters
  -- as passed.


  -- ==========================================================================
  -- 2. VALIDATION & OWNERSHIP VERIFICATION
  -- ==========================================================================
  IF p_payment_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'data', null,
      'isIdempotentReplay', false,
      'errorCode', 'VALIDATION_MISSING_PAYMENT_ID'
    );
  END IF;

  IF p_order_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'data', null,
      'isIdempotentReplay', false,
      'errorCode', 'VALIDATION_MISSING_ORDER_ID'
    );
  END IF;

  IF NOT p_is_admin THEN
    IF p_customer_id IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'data', null,
        'isIdempotentReplay', false,
        'errorCode', 'VALIDATION_MISSING_CUSTOMER_ID'
      );
    END IF;
  END IF;

  SELECT * INTO v_payment_row FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'data', null,
      'isIdempotentReplay', false,
      'errorCode', 'NOT_FOUND'
    );
  END IF;

  IF v_payment_row.payment_provider = 'razorpay' THEN
    IF p_razorpay_payment_id IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'data', null,
        'isIdempotentReplay', false,
        'errorCode', 'VALIDATION_MISSING_RAZORPAY_PAYMENT_ID'
      );
    END IF;

    IF p_razorpay_signature IS NULL AND NOT p_is_admin AND NOT p_is_webhook THEN
      RETURN jsonb_build_object(
        'success', false,
        'data', null,
        'isIdempotentReplay', false,
        'errorCode', 'VALIDATION_MISSING_RAZORPAY_SIGNATURE'
      );
    END IF;
  END IF;

  SELECT * INTO v_order_row FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'data', null,
      'isIdempotentReplay', false,
      'errorCode', 'NOT_FOUND'
    );
  END IF;

  IF v_payment_row.order_id IS DISTINCT FROM v_order_row.id THEN
    RETURN jsonb_build_object(
      'success', false,
      'data', null,
      'isIdempotentReplay', false,
      'errorCode', 'FORBIDDEN'
    );
  END IF;

  IF NOT p_is_admin AND v_order_row.user_id IS DISTINCT FROM p_customer_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'data', null,
      'isIdempotentReplay', false,
      'errorCode', 'FORBIDDEN'
    );
  END IF;

  IF v_payment_row.payment_status = 'pending' AND v_order_row.payment_status = 'pending' THEN
    -- Allow execution to proceed
    NULL;
  ELSIF v_payment_row.payment_status = 'success' AND v_order_row.payment_status = 'success' THEN
    -- Fall through to Step 3 (Idempotency Guard)
    NULL;
  ELSE
    RETURN jsonb_build_object(
      'success', false,
      'data', null,
      'isIdempotentReplay', false,
      'errorCode', 'CONFLICT'
    );
  END IF;


  -- ==========================================================================
  -- 3. IDEMPOTENCY GUARD
  -- ==========================================================================
  SELECT EXISTS(
    SELECT 1 FROM public.ledger_entries
    WHERE order_id = p_order_id AND status = 'confirmed' AND type = 'credit'
  ) INTO v_ledger_confirmed;

  IF v_payment_row.payment_status = 'success' AND v_order_row.payment_status = 'success' AND (v_payment_row.credited_at IS NOT NULL) AND v_ledger_confirmed THEN
    v_is_idempotent_replay := TRUE;
    
    SELECT 
      COUNT(DISTINCT operation_key), 
      MIN(operation_key)
    INTO 
      v_operation_key_count, 
      v_operation_key
    FROM public.ledger_entries
    WHERE order_id = p_order_id AND status = 'confirmed' AND type = 'credit';

    IF v_operation_key_count <> 1 THEN
      RETURN jsonb_build_object(
        'success', false,
        'data', null,
        'isIdempotentReplay', false,
        'errorCode', 'CONFLICT'
      );
    END IF;

    v_order_status        := v_payment_row.payment_status;

    v_razorpay_payment_id := v_payment_row.razorpay_payment_id;
    v_credited_at         := v_payment_row.credited_at;
    
  ELSIF (v_payment_row.credited_at IS NOT NULL) OR v_ledger_confirmed OR v_payment_row.payment_status = 'success' OR v_order_row.payment_status = 'success' THEN
    RETURN jsonb_build_object(
      'success', false,
      'data', null,
      'isIdempotentReplay', false,
      'errorCode', 'CONFLICT'
    );
  ELSE
    v_is_idempotent_replay := FALSE;
  END IF;


  -- ==========================================================================
  -- 4. PAYMENT / ORDER / LEDGER LOOKUP & PROVENANCE VALIDATION
  -- ==========================================================================
  IF NOT v_is_idempotent_replay THEN
    -- NEW: Explicitly lock the canonical ledger rows for this operation
    -- to serialize confirmation against concurrent payout or refund writers
    PERFORM 1 FROM public.ledger_entries
    WHERE order_id = p_order_id 
      AND status = 'pending'
      AND type = 'credit'
    FOR UPDATE;

    SELECT 
      COUNT(DISTINCT operation_key), 
      MIN(operation_key)
    INTO 
      v_operation_key_count, 
      v_operation_key
    FROM public.ledger_entries
    WHERE order_id = p_order_id AND status = 'pending' AND type = 'credit';

    IF v_operation_key_count <> 1 THEN
      RETURN jsonb_build_object(
        'success', false,
        'data', null,
        'isIdempotentReplay', false,
        'errorCode', 'CONFLICT'
      );
    END IF;

    SELECT SUM(amount_paise) INTO v_amount_paise
    FROM public.ledger_entries
    WHERE order_id = p_order_id 
      AND operation_key = v_operation_key 
      AND status = 'pending' 
      AND type = 'credit';

    IF v_amount_paise IS NULL OR v_amount_paise <= 0 THEN
      RETURN jsonb_build_object(
        'success', false,
        'data', null,
        'isIdempotentReplay', false,
        'errorCode', 'CONFLICT'
      );
    END IF;
  ELSE
    SELECT SUM(amount_paise) INTO v_amount_paise
    FROM public.ledger_entries
    WHERE order_id = p_order_id 
      AND operation_key = v_operation_key 
      AND status = 'confirmed' 
      AND type = 'credit';

    IF v_amount_paise IS NULL OR v_amount_paise <= 0 THEN
      RETURN jsonb_build_object(
        'success', false,
        'data', null,
        'isIdempotentReplay', false,
        'errorCode', 'CONFLICT'
      );
    END IF;
  END IF;


  -- ==========================================================================
  -- 5. ATOMIC STATE TRANSITIONS
  -- ==========================================================================
  IF NOT v_is_idempotent_replay THEN
    BEGIN
      -- Mutate state sequentially, validating uniqueness via RETURNING clauses
      UPDATE public.payments 
      SET payment_status = 'success', 
          razorpay_payment_id = COALESCE(p_razorpay_payment_id, razorpay_payment_id), 
          razorpay_signature = COALESCE(p_razorpay_signature, razorpay_signature), 
          transaction_id = COALESCE(p_transaction_id, transaction_id),
          credited_at = v_now 
      WHERE id = p_payment_id AND payment_status = 'pending'
      RETURNING 1 INTO v_payment_rows_updated;

      IF v_payment_rows_updated IS NULL THEN
        RAISE EXCEPTION 'state_transition_conflict';
      END IF;

      UPDATE public.orders 
      SET payment_status = 'success',
          order_status = 'confirmed' 
      WHERE id = p_order_id AND payment_status = 'pending'
      RETURNING 1 INTO v_order_rows_updated;

      IF v_order_rows_updated IS NULL THEN
        RAISE EXCEPTION 'state_transition_conflict';
      END IF;

      UPDATE public.ledger_entries 
      SET status = 'confirmed', 
          confirmed_at = v_now 
      WHERE order_id = p_order_id AND operation_key = v_operation_key AND status = 'pending';
      
      GET DIAGNOSTICS v_ledger_rows_updated = ROW_COUNT;
      IF v_ledger_rows_updated = 0 THEN
        RAISE EXCEPTION 'state_transition_conflict';
      END IF;

      -- ISSUE #22: Preserve historical vendor earnings/sales baseline.
      -- Reintroduce the missing forward-moving increments previously handled by the deprecated
      -- on_payment_success trigger. We do this explicitly AFTER ledger confirmation so that we can 
      -- trust the canonical paise amount stored in the ledger rather than duplicating commission math.
      SELECT COUNT(DISTINCT vendor_id) INTO v_expected_vendor_count
      FROM public.ledger_entries
      WHERE order_id = p_order_id AND operation_key = v_operation_key AND status = 'confirmed' AND type = 'credit';

      UPDATE public.vendors v
      SET total_earnings = COALESCE(v.total_earnings, 0) + (agg.vendor_earnings_paise::numeric / 100::numeric),
          total_sales = COALESCE(v.total_sales, 0) + 1
      FROM (
        SELECT vendor_id, SUM(amount_paise) AS vendor_earnings_paise
        FROM public.ledger_entries
        WHERE order_id = p_order_id AND operation_key = v_operation_key AND status = 'confirmed' AND type = 'credit'
        GROUP BY vendor_id
      ) agg
      WHERE v.id = agg.vendor_id;
      
      GET DIAGNOSTICS v_vendor_rows_updated = ROW_COUNT;
      IF v_expected_vendor_count <= 0 OR v_vendor_rows_updated <> v_expected_vendor_count THEN
        RAISE EXCEPTION 'state_transition_conflict';
      END IF;

    EXCEPTION
      WHEN OTHERS THEN
        IF SQLERRM = 'state_transition_conflict' THEN
          RETURN jsonb_build_object(
            'success', false,
            'data', null,
            'isIdempotentReplay', false,
            'errorCode', 'CONFLICT'
          );
        ELSE
          RAISE;
        END IF;
    END;
  END IF;


  -- ==========================================================================
  -- 6. RESPONSE CONSTRUCTION
  -- ==========================================================================
  IF v_is_idempotent_replay THEN
    v_replay_data := jsonb_build_object(
      'paymentId', p_payment_id,
      'orderId', p_order_id,
      'status', v_order_status,
      'amountPaise', v_amount_paise,
      'razorpayPaymentId', v_razorpay_payment_id,
      'operationKey', v_operation_key,
      'creditedAt', v_credited_at
    );

    v_response := jsonb_build_object(
      'success', true,
      'data', v_replay_data,
      'isIdempotentReplay', true,
      'errorCode', null
    );
    RETURN v_response;
  ELSE

    v_response := jsonb_build_object(
      'success', true,
      'data', jsonb_build_object(
        'paymentId', p_payment_id,
        'orderId', p_order_id,
        'status', 'success',
        'amountPaise', v_amount_paise,
        'razorpayPaymentId', COALESCE(p_razorpay_payment_id, v_payment_row.razorpay_payment_id),
        'operationKey', v_operation_key,
        'creditedAt', v_now
      ),
      'isIdempotentReplay', false,
      'errorCode', null
    );
    RETURN v_response;
  END IF;


  -- ==========================================================================
  -- 7. ERROR HANDLING
  -- ==========================================================================
  -- Catch-all for unexpected database failures. We emit structured 
  -- diagnostics to the PostgreSQL server logs for operational visibility, 
  -- but suppress all internals (SQLSTATE, SQLERRM) from the client response 
  -- to prevent information leakage, returning a canonical INTERNAL_ERROR.
EXCEPTION
  WHEN serialization_failure OR deadlock_detected OR lock_not_available THEN
    RAISE;
  WHEN OTHERS THEN
    RAISE WARNING '[payment_confirmation_failure] Unhandled exception in create_payment_confirm (payment_id: %, order_id: %). SQLSTATE: %, SQLERRM: %', 
      p_payment_id, p_order_id, SQLSTATE, SQLERRM;

    RETURN jsonb_build_object(
      'success', false,
      'data', null,
      'isIdempotentReplay', false,
      'errorCode', 'INTERNAL_ERROR'
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.create_payment_confirm(uuid, uuid, text, text, uuid, boolean, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_payment_confirm(uuid, uuid, text, text, uuid, boolean, text, boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_payment_confirm(uuid, uuid, text, text, uuid, boolean, text, boolean) TO service_role;
