-- Migration: 20260804120000_fix_vendor_reject_return_auth_resolution.sql
-- Phase 4 Task 4.3 follow-up — Canonical auth.users.id → vendors.id resolution.
--
-- Problem:
--   The previous RPC accepted p_vendor_id (vendors.id) from the caller.
--   The Edge Function passed auth.users.id (auth.users.id ≠ vendors.id in
--   production; vendors.id is gen_random_uuid()).  The test fixtures masked
--   this by coincidentally setting vendors.id = auth.users.id.
--
-- Fix:
--   Accept p_auth_user_id (auth.users.id) instead.  Resolve vendors.id
--   internally via `SELECT id FROM vendors WHERE user_id = p_auth_user_id`.
--   The Edge Function no longer needs to know what a vendors.id is.
--
-- Scope: vendor_reject_return only.  approve_return_intent is out of scope.

-- Note on DROP vs CREATE OR REPLACE:
--   Although the function signature types (UUID, UUID) remain identical,
--   PostgreSQL prevents changing input parameter names (p_vendor_id to
--   p_auth_user_id) using CREATE OR REPLACE alone, throwing an error.
--   Therefore, an explicit DROP FUNCTION is required before recreating it.

-- 1. Create or replace the canonical auth-resolving RPC.
DROP FUNCTION IF EXISTS public.vendor_reject_return(UUID, UUID);
CREATE OR REPLACE FUNCTION public.vendor_reject_return(
    p_order_item_id UUID,
    p_auth_user_id  UUID    -- auth.users.id supplied by the Edge Function
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order_item    RECORD;
    v_vendor_id     UUID;
    v_row_count     INTEGER;
    v_is_idempotent_replay BOOLEAN := false;
    v_response      JSONB := jsonb_build_object(
        'success',           false,
        'data',              null,
        'isIdempotentReplay', false,
        'errorCode',         'NOT_IMPLEMENTED'
    );
BEGIN
    -------------------------------------------------------------------------
    -- 1. Authorization
    -------------------------------------------------------------------------
    -- Executed by service_role only (see grants below).
    -- Zero-trust is enforced via data lookup in sections 2 and 3.

    -------------------------------------------------------------------------
    -- 2. Identity Resolution — auth.users.id → vendors.id
    -------------------------------------------------------------------------
    -- Resolve the caller's auth UID to a vendors row BEFORE acquiring any
    -- lock.  A caller with no vendor record should never hold a row lock on
    -- order_items; failing fast here avoids unnecessary contention.
    --
    -- Note: public.vendors.user_id is guaranteed unique by the table schema
    -- (UNIQUE constraint). Therefore, this SELECT ... INTO is strictly
    -- deterministic and requires no additional runtime cardinality checks.
    SELECT id INTO v_vendor_id
    FROM public.vendors
    WHERE user_id = p_auth_user_id;

    IF NOT FOUND THEN
        RAISE WARNING '[vendor_reject_return] No vendor row for auth uid %', p_auth_user_id;
        v_response := jsonb_set(v_response, '{errorCode}', '"FORBIDDEN"');
        RETURN v_response;
    END IF;

    -------------------------------------------------------------------------
    -- 3. Row Lock
    -------------------------------------------------------------------------
    -- Lock the target order item for the duration of the transaction.
    -- Vendor identity is already resolved; this lock gates mutation only.
    SELECT * INTO v_order_item
    FROM public.order_items
    WHERE id = p_order_item_id
    FOR UPDATE;

    IF NOT FOUND THEN
        v_response := jsonb_set(v_response, '{errorCode}', '"NOT_FOUND"');
        RETURN v_response;
    END IF;

    -------------------------------------------------------------------------
    -- 4. Ownership Verification (Zero-Trust under lock)
    -------------------------------------------------------------------------
    IF v_order_item.vendor_id IS DISTINCT FROM v_vendor_id THEN
        v_response := jsonb_set(v_response, '{errorCode}', '"FORBIDDEN"');
        RETURN v_response;
    END IF;

    -------------------------------------------------------------------------
    -- 5. Idempotency & State Guard
    -------------------------------------------------------------------------
    IF v_order_item.return_status = 'rejected' THEN
        v_is_idempotent_replay := true;
        v_response := jsonb_build_object(
            'success',            true,
            'data',               jsonb_build_object(
                'orderItemId',  p_order_item_id,
                'returnStatus', 'rejected'
            ),
            'isIdempotentReplay', v_is_idempotent_replay,
            'errorCode',          NULL
        );
        RETURN v_response;
    ELSIF v_order_item.return_status <> 'requested' THEN
        v_response := jsonb_set(v_response, '{errorCode}', '"RETURN_NOT_PENDING"');
        RETURN v_response;
    END IF;

    -------------------------------------------------------------------------
    -- 6. Atomic Mutation
    -------------------------------------------------------------------------
    -- Predecessor state encoded in WHERE clause for absolute safety.
    UPDATE public.order_items
    SET return_status = 'rejected'
    WHERE id = p_order_item_id
      AND return_status = 'requested';

    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    IF v_row_count <> 1 THEN
        RAISE EXCEPTION 'order_item_transition_failed' USING ERRCODE = 'P0001';
    END IF;

    -------------------------------------------------------------------------
    -- 7. Canonical Response Construction
    -------------------------------------------------------------------------
    v_response := jsonb_build_object(
        'success',            true,
        'data',               jsonb_build_object(
            'orderItemId',  p_order_item_id,
            'returnStatus', 'rejected'
        ),
        'isIdempotentReplay', v_is_idempotent_replay,
        'errorCode',          NULL
    );

    RETURN v_response;

EXCEPTION
    -- Preserve Phase 4 retryable SQLSTATE re-raise behavior.
    WHEN serialization_failure OR deadlock_detected OR lock_not_available THEN
        RAISE;

    -- Catch defensive invariant failures raised internally.
    WHEN raise_exception THEN
        IF SQLERRM = 'order_item_transition_failed' THEN
            RAISE WARNING '[vendor_reject_return] Defensive invariant failure for order_item %: % (SQLSTATE: %)',
                p_order_item_id, SQLERRM, SQLSTATE;
            RETURN jsonb_build_object(
                'success',            false,
                'data',               null,
                'isIdempotentReplay', false,
                'errorCode',          'CONFLICT'
            );
        END IF;

        RAISE WARNING '[vendor_reject_return] Unhandled raise_exception (order_item_id: %). SQLSTATE: %, SQLERRM: %',
            p_order_item_id, SQLSTATE, SQLERRM;
        RETURN jsonb_build_object(
            'success',            false,
            'data',               null,
            'isIdempotentReplay', false,
            'errorCode',          'INTERNAL_ERROR'
        );

    WHEN OTHERS THEN
        RAISE WARNING '[vendor_reject_return] Transaction failed for order_item %: % (SQLSTATE: %)',
            p_order_item_id, SQLERRM, SQLSTATE;
        RETURN jsonb_build_object(
            'success',            false,
            'data',               null,
            'isIdempotentReplay', false,
            'errorCode',          'INTERNAL_ERROR'
        );
END;
$$;

-- 2. Secure execution grants — service_role only; no direct client access.
REVOKE ALL     ON FUNCTION public.vendor_reject_return(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.vendor_reject_return(UUID, UUID) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.vendor_reject_return(UUID, UUID) TO service_role;

COMMENT ON FUNCTION public.vendor_reject_return(UUID, UUID) IS
    'Canonical return-rejection RPC.  Accepts auth.users.id and resolves to '
    'vendors.id internally — callers never supply vendors.id directly.  '
    'Transitions return_status to ''rejected''.  Idempotent via FOR UPDATE '
    'lock + status guard.  service_role only.';
