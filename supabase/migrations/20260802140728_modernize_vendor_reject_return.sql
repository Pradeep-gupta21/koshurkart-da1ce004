-- Phase 4 Task 4.3 - Modernize vendor_reject_return RPC to canonical architecture.

-- 1. Drop the legacy signature
DROP FUNCTION IF EXISTS public.vendor_reject_return(uuid);

-- 2. Create the canonical Phase 4 RPC
CREATE OR REPLACE FUNCTION public.vendor_reject_return(
    p_order_item_id UUID,
    p_vendor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order_item RECORD;
    v_row_count INTEGER;
    v_is_idempotent_replay BOOLEAN := false;
    v_response JSONB := jsonb_build_object('success', false, 'data', null, 'isIdempotentReplay', false, 'errorCode', 'NOT_IMPLEMENTED');
BEGIN
    -------------------------------------------------------------------------
    -- 1. Authorization
    -------------------------------------------------------------------------
    -- Executed by service_role; zero-trust is handled via data lookup.

    -------------------------------------------------------------------------
    -- 2. Validation & Ownership Verification (Under Lock)
    -------------------------------------------------------------------------
    -- Lock the row first to eliminate TOCTOU risks.
    SELECT * INTO v_order_item
    FROM public.order_items
    WHERE id = p_order_item_id
    FOR UPDATE;

    IF NOT FOUND THEN
        v_response := jsonb_set(v_response, '{errorCode}', '"NOT_FOUND"');
        RETURN v_response;
    END IF;

    -- Zero-Trust Identity Assertion under lock
    IF v_order_item.vendor_id IS DISTINCT FROM p_vendor_id THEN
        v_response := jsonb_set(v_response, '{errorCode}', '"FORBIDDEN"');
        RETURN v_response;
    END IF;

    -------------------------------------------------------------------------
    -- 3. Idempotency & State Guard
    -------------------------------------------------------------------------
    IF v_order_item.return_status = 'rejected' THEN
        v_is_idempotent_replay := true;
        v_response := jsonb_build_object(
            'success', true,
            'data', jsonb_build_object(
                'orderItemId', p_order_item_id,
                'returnStatus', 'rejected'
            ),
            'isIdempotentReplay', v_is_idempotent_replay,
            'errorCode', NULL
        );
        RETURN v_response;
    ELSIF v_order_item.return_status <> 'requested' THEN
        v_response := jsonb_set(v_response, '{errorCode}', '"RETURN_NOT_PENDING"');
        RETURN v_response;
    END IF;

    -------------------------------------------------------------------------
    -- 4. Atomic Mutation
    -------------------------------------------------------------------------
    -- Encoded predecessor state directly in the WHERE clause for absolute safety
    UPDATE public.order_items
    SET return_status = 'rejected'
    WHERE id = p_order_item_id
      AND return_status = 'requested';

    -- Canonical mutation verification
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    IF v_row_count <> 1 THEN
        RAISE EXCEPTION 'order_item_transition_failed' USING ERRCODE = 'P0001';
    END IF;

    -------------------------------------------------------------------------
    -- 5. Canonical Response Construction
    -------------------------------------------------------------------------
    v_response := jsonb_build_object(
        'success', true,
        'data', jsonb_build_object(
            'orderItemId', p_order_item_id,
            'returnStatus', 'rejected'
        ),
        'isIdempotentReplay', v_is_idempotent_replay,
        'errorCode', NULL
    );

    RETURN v_response;

EXCEPTION
    -- Preserve Phase 4 retryable SQLSTATE re-raise behavior
    WHEN serialization_failure OR deadlock_detected OR lock_not_available THEN
        RAISE;

    -- Catch defensive invariant failures raised internally
    WHEN raise_exception THEN
        IF SQLERRM = 'order_item_transition_failed' THEN
            RAISE WARNING '[vendor_reject_return] Defensive invariant failure for order_item %: % (SQLSTATE: %)',
                p_order_item_id, SQLERRM, SQLSTATE;
            RETURN jsonb_build_object(
              'success', false,
              'data', null,
              'isIdempotentReplay', false,
              'errorCode', 'CONFLICT'
            );
        END IF;
        
        RAISE WARNING '[vendor_reject_return] Unhandled raise_exception (order_item_id: %). SQLSTATE: %, SQLERRM: %',
            p_order_item_id, SQLSTATE, SQLERRM;
        RETURN jsonb_build_object(
          'success', false,
          'data', null,
          'isIdempotentReplay', false,
          'errorCode', 'INTERNAL_ERROR'
        );

    WHEN OTHERS THEN
        RAISE WARNING '[vendor_reject_return] Transaction failed for order_item %: % (SQLSTATE: %)', p_order_item_id, SQLERRM, SQLSTATE;
        RETURN jsonb_build_object('success', false, 'data', null, 'isIdempotentReplay', false, 'errorCode', 'INTERNAL_ERROR');
END;
$$;

-- 3. Secure execution grants
REVOKE ALL ON FUNCTION public.vendor_reject_return(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.vendor_reject_return(UUID, UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vendor_reject_return(UUID, UUID) TO service_role;

COMMENT ON FUNCTION public.vendor_reject_return(UUID, UUID) IS 'Canonical return rejection RPC. Transitions return_status to ''rejected''. Idempotent via FOR UPDATE lock + status guard.';

