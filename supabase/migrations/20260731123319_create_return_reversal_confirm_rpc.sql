-- Phase 4 Task 3.2 - Structural skeleton for create_return_reversal_confirm.

CREATE OR REPLACE FUNCTION public.create_return_reversal_confirm(
    p_order_item_id uuid,
    p_razorpay_reversal_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    -- order item lookup
    v_order_item RECORD;

    -- idempotency & ledger provenance
    v_is_idempotent_replay BOOLEAN := FALSE;
    v_operation_key TEXT;
    v_ledger_row_count INTEGER;
    v_ledger_razorpay_reference_id TEXT;

    -- timestamps
    v_now TIMESTAMPTZ := now();

    -- response construction
    v_response JSONB;

BEGIN
    -------------------------------------------------------------------------
    -- 1. Authorization
    -------------------------------------------------------------------------
    -- RPC execution is restricted to service_role.
    -- Authentication/provider verification belongs to the trusted orchestration boundary.
    -- Database state/provenance is still independently validated by the RPC.

    -------------------------------------------------------------------------
    -- 2. Validation, Ownership & Locking
    -------------------------------------------------------------------------
    IF p_order_item_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'data', null,
            'isIdempotentReplay', false,
            'errorCode', 'VALIDATION_MISSING_ORDER_ITEM_ID'
        );
    END IF;

    IF p_razorpay_reversal_id IS NULL OR trim(p_razorpay_reversal_id) = '' THEN
        RETURN jsonb_build_object(
            'success', false,
            'data', null,
            'isIdempotentReplay', false,
            'errorCode', 'VALIDATION_MISSING_RAZORPAY_REVERSAL_ID'
        );
    END IF;

    -- Canonical deterministic lock on the order_item for this return flow.
    -- This ensures concurrent reversal webhooks for the same item serialize here.
    SELECT * INTO v_order_item
    FROM public.order_items
    WHERE id = p_order_item_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'data', null,
            'isIdempotentReplay', false,
            'errorCode', 'NOT_FOUND'
        );
    END IF;

    -- Relational integrity check:
    -- 'order_id' is NOT NULL and ON DELETE CASCADE, guaranteeing parent order existence.
    -- However, 'vendor_id' is ON DELETE SET NULL, permitting nulls.
    -- We explicitly validate both to ensure the canonical workflow context is intact.
    IF v_order_item.order_id IS NULL OR v_order_item.vendor_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'data', null,
            'isIdempotentReplay', false,
            'errorCode', 'VALIDATION_FAILED'
        );
    END IF;

    -- State Validation Boundary
    -- 1. 'reversing': Fresh execution candidate.
    -- 2. 'refunding': Potential replay candidate (reversal already succeeded).
    -- 3. Everything else: Invalid state.
    IF v_order_item.return_status = 'reversing' THEN
        -- Potential fresh execution: proceed to idempotency/provenance (Task 3.4)
        NULL;
    ELSIF v_order_item.return_status = 'refunding' THEN
        -- Potential replay candidate: proceed to idempotency/provenance (Task 3.4)
        -- Task 3.4 must prove the stored reversal provenance matches the incoming Razorpay reversal ID.
        NULL;
    ELSE
        RETURN jsonb_build_object(
            'success', false,
            'data', null,
            'isIdempotentReplay', false,
            'errorCode', 'CONFLICT'
        );
    END IF;

    -------------------------------------------------------------------------
    -- 3. Idempotency & Reversal Provenance
    -------------------------------------------------------------------------
    IF v_order_item.return_status = 'reversing' THEN
        -- A. FRESH EXECUTION
        -- 1. Validate that the Razorpay reversal ID hasn't been set yet (corruption guard).
        IF v_order_item.razorpay_reversal_id IS NOT NULL THEN
            RETURN jsonb_build_object(
                'success', false,
                'data', null,
                'isIdempotentReplay', false,
                'errorCode', 'CONFLICT'
            );
        END IF;

        -- 2. Prove exactly one canonical pending reversal ledger row exists
        -- for the completely locked financial context.
        SELECT COUNT(*)
        INTO v_ledger_row_count
        FROM public.ledger_entries
        WHERE order_item_id = p_order_item_id
          AND order_id = v_order_item.order_id
          AND vendor_id = v_order_item.vendor_id
          AND type = 'reversal'
          AND status = 'pending';

        IF v_ledger_row_count <> 1 THEN
            RETURN jsonb_build_object(
                'success', false,
                'data', null,
                'isIdempotentReplay', false,
                'errorCode', 'CONFLICT'
            );
        END IF;

        -- 3. Identify and lock the exact canonical row for confirmation.
        SELECT operation_key
        INTO v_operation_key
        FROM public.ledger_entries
        WHERE order_item_id = p_order_item_id
          AND order_id = v_order_item.order_id
          AND vendor_id = v_order_item.vendor_id
          AND type = 'reversal'
          AND status = 'pending'
        FOR UPDATE;

        v_is_idempotent_replay := FALSE;

    ELSIF v_order_item.return_status = 'refunding' THEN
        -- B. POTENTIAL REPLAY
        -- 1. Validate that the incoming Razorpay ID matches the persisted authoritative ID.
        -- If it differs, this is a conflict/provenance violation, not a replay.
        IF v_order_item.razorpay_reversal_id IS DISTINCT FROM p_razorpay_reversal_id THEN
            RETURN jsonb_build_object(
                'success', false,
                'data', null,
                'isIdempotentReplay', false,
                'errorCode', 'CONFLICT'
            );
        END IF;

        -- 2. Prove exactly one canonical confirmed reversal ledger row exists
        -- for the completely locked financial context.
        SELECT COUNT(*)
        INTO v_ledger_row_count
        FROM public.ledger_entries
        WHERE order_item_id = p_order_item_id
          AND order_id = v_order_item.order_id
          AND vendor_id = v_order_item.vendor_id
          AND type = 'reversal'
          AND status = 'confirmed';

        IF v_ledger_row_count <> 1 THEN
            RETURN jsonb_build_object(
                'success', false,
                'data', null,
                'isIdempotentReplay', false,
                'errorCode', 'CONFLICT'
            );
        END IF;

        -- 3. Verify ledger provider reference perfectly matches the incoming reversal ID.
        SELECT razorpay_reference_id, operation_key
        INTO v_ledger_razorpay_reference_id, v_operation_key
        FROM public.ledger_entries
        WHERE order_item_id = p_order_item_id
          AND order_id = v_order_item.order_id
          AND vendor_id = v_order_item.vendor_id
          AND type = 'reversal'
          AND status = 'confirmed';

        IF v_ledger_razorpay_reference_id IS DISTINCT FROM p_razorpay_reversal_id THEN
            RETURN jsonb_build_object(
                'success', false,
                'data', null,
                'isIdempotentReplay', false,
                'errorCode', 'CONFLICT'
            );
        END IF;

        v_is_idempotent_replay := TRUE;
    END IF;

    -------------------------------------------------------------------------
    -- 4. Canonical Reversal Ledger Confirmation
    -------------------------------------------------------------------------
    -- TODO Task 3.5

    -------------------------------------------------------------------------
    -- 5. Atomic Return State Transition
    -------------------------------------------------------------------------
    -- TODO Task 3.5
    -- Note: The authoritative state transition is 'reversing' -> 'refunding'.
    -- There is NO 'reversed' state. 'refunding' is the mandatory postcondition.
    -- (The final 'refunding' -> 'approved' transition will be owned by create_return_refund_confirm).

    -------------------------------------------------------------------------
    -- 6. Response / Replay Hydration
    -------------------------------------------------------------------------
    -- TODO Task 3.6

    -- Temporary NOT_IMPLEMENTED response for the skeleton
    v_response := jsonb_build_object(
      'success', false,
      'data', null,
      'isIdempotentReplay', false,
      'errorCode', 'NOT_IMPLEMENTED'
    );
    RETURN v_response;

    -------------------------------------------------------------------------
    -- 7. Error & Concurrency Normalization
    -------------------------------------------------------------------------
    -- TODO Task 3.7 (must account for:
    -- Retryable/re-raised: serialization_failure, deadlock_detected, lock_not_available
    -- Integrity/business normalization: unique_violation, check_violation, foreign_key_violation
    -- Unexpected: OTHERS with internal logging and sanitized API response)
EXCEPTION
    WHEN serialization_failure OR deadlock_detected OR lock_not_available THEN
        RAISE; -- Preserve Phase 4 architectural retryable SQLSTATE re-raise behavior
    WHEN OTHERS THEN
        RAISE WARNING '[return_reversal_confirmation_failure] Unhandled exception in create_return_reversal_confirm (order_item_id: %). SQLSTATE: %, SQLERRM: %',
            p_order_item_id, SQLSTATE, SQLERRM;
        RETURN jsonb_build_object(
          'success', false,
          'data', null,
          'isIdempotentReplay', false,
          'errorCode', 'INTERNAL_ERROR'
        );
END;
$$;

REVOKE ALL ON FUNCTION public.create_return_reversal_confirm(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_return_reversal_confirm(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_return_reversal_confirm(uuid, text) TO service_role;
