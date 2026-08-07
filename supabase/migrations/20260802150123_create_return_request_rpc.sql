-- Phase 4 Task 4.3 Step 2 - Canonical create_return_request RPC

-- Drop any previous signatures safely
DROP FUNCTION IF EXISTS public.create_return_request(UUID, UUID);
DROP FUNCTION IF EXISTS public.create_return_request(UUID, UUID, TEXT, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.create_return_request(UUID, UUID, TEXT, TEXT, TEXT[]);

-- Create the canonical Phase 4 RPC
CREATE OR REPLACE FUNCTION public.create_return_request(
    p_order_item_id UUID,
    p_customer_id UUID,
    p_return_reason TEXT,
    p_return_description TEXT,
    p_return_photos TEXT[]
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
    v_requested_at TIMESTAMPTZ := NOW();
BEGIN
    -------------------------------------------------------------------------
    -- 1. Authorization
    -------------------------------------------------------------------------
    -- Executed by service_role; zero-trust is handled via data lookup.

    -------------------------------------------------------------------------
    -- 2. Validation & Ownership Verification (Under Lock)
    -------------------------------------------------------------------------
    -- Lock the row and resolve identity atomically to eliminate TOCTOU risks.
    SELECT oi.*, o.user_id AS customer_id
    INTO v_order_item
    FROM public.order_items oi
    JOIN public.orders o ON oi.order_id = o.id
    WHERE oi.id = p_order_item_id
    FOR UPDATE OF oi;

    IF NOT FOUND THEN
        v_response := jsonb_set(v_response, '{errorCode}', '"NOT_FOUND"');
        RETURN v_response;
    END IF;

    -- Zero-Trust Identity Assertion under lock
    IF v_order_item.customer_id IS DISTINCT FROM p_customer_id THEN
        v_response := jsonb_set(v_response, '{errorCode}', '"FORBIDDEN"');
        RETURN v_response;
    END IF;

    -------------------------------------------------------------------------
    -- 3. Idempotency & State Guard
    -------------------------------------------------------------------------
    IF v_order_item.return_status = 'requested' THEN
        v_is_idempotent_replay := true;
        v_response := jsonb_build_object(
            'success', true,
            'data', jsonb_build_object(
                'orderItemId', p_order_item_id,
                'returnStatus', 'requested',
                'returnRequestedAt', v_order_item.return_requested_at
            ),
            'isIdempotentReplay', v_is_idempotent_replay,
            'errorCode', NULL
        );
        RETURN v_response;
    ELSIF v_order_item.return_status <> 'none' THEN
        v_response := jsonb_set(v_response, '{errorCode}', '"RETURN_ALREADY_PROCESSED"');
        RETURN v_response;
    END IF;

    -------------------------------------------------------------------------
    -- 4. Atomic Mutation
    -------------------------------------------------------------------------
    -- Encoded expected predecessor state directly in the WHERE clause for absolute safety
    UPDATE public.order_items
    SET 
        return_status = 'requested',
        return_reason = p_return_reason,
        return_description = p_return_description,
        return_photos = p_return_photos,
        return_requested_at = v_requested_at
    WHERE id = p_order_item_id
      AND return_status = 'none';

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
            'returnStatus', 'requested',
            'returnRequestedAt', v_requested_at
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
            RAISE WARNING '[create_return_request] Defensive invariant failure for order_item %: % (SQLSTATE: %)',
                p_order_item_id, SQLERRM, SQLSTATE;
            RETURN jsonb_build_object(
              'success', false,
              'data', null,
              'isIdempotentReplay', false,
              'errorCode', 'CONFLICT'
            );
        END IF;
        
        RAISE WARNING '[create_return_request] Unhandled raise_exception (order_item_id: %). SQLSTATE: %, SQLERRM: %',
            p_order_item_id, SQLSTATE, SQLERRM;
        RETURN jsonb_build_object(
          'success', false,
          'data', null,
          'isIdempotentReplay', false,
          'errorCode', 'INTERNAL_ERROR'
        );

    WHEN OTHERS THEN
        RAISE WARNING '[create_return_request] Transaction failed for order_item %: % (SQLSTATE: %)', p_order_item_id, SQLERRM, SQLSTATE;
        RETURN jsonb_build_object('success', false, 'data', null, 'isIdempotentReplay', false, 'errorCode', 'INTERNAL_ERROR');
END;
$$;

-- Secure execution grants
REVOKE ALL ON FUNCTION public.create_return_request(UUID, UUID, TEXT, TEXT, TEXT[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_return_request(UUID, UUID, TEXT, TEXT, TEXT[]) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_return_request(UUID, UUID, TEXT, TEXT, TEXT[]) TO service_role;

-- Canonical metadata
COMMENT ON FUNCTION public.create_return_request(UUID, UUID, TEXT, TEXT, TEXT[]) IS 'Canonical return request RPC. Transitions return_status from ''none'' to ''requested''. Idempotent via FOR UPDATE lock + status guard.';
