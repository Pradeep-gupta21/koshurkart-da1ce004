-- ============================================================================
-- Migration: 20260727190002_fix_approve_return_intent_escalated_state.sql
-- Phase: 4 — Task 2.8 (Architecture Alignment) — Part 2
--
-- Purpose:
--   Correct the approve_return_intent RPC to use 'escalated' instead of
--   'approved' for the escalation path (insufficient vendor balance scenario).
--
-- Background:
--   The prior implementation (`20260727174432`) used 'approved' for both:
--     (a) the escalation path (insufficient balance, finance_admin required)
--     (b) the intended terminal state (return fully complete)
--   This was acknowledged in a comment as a pragmatic reuse of an existing
--   enum value, pending a prerequisite schema change.
--
--   The architecture specification (`02-state-machines.md` §3) has always
--   defined distinct states:
--     'escalated' — non-terminal, blocked pending admin resolution
--     'approved'  — terminal, return fully complete
--
--   This migration closes that drift, exactly as required by the ADR
--   produced in Phase 4 Task 3.1A (Decision 2).
--
-- Changes (business logic is unchanged):
--   1. Idempotency guard: 'approved' → 'escalated' in the status IN() check
--   2. Escalation transition: SET return_status = 'approved' → 'escalated'
--   3. Replay hydration branch: ELSIF 'approved' → ELSIF 'escalated'
--   4. Fresh-exec response: v_order_item_status := 'approved' → 'escalated'
--
-- What does NOT change:
--   - Function signature (input parameters)
--   - Return contract (JSONB shape)
--   - Authorization model (service_role only)
--   - Ledger writes
--   - Financial calculations
--   - Balance check logic
--   - Escalation table insert
--   - Operation key generation
--   - Idempotency strategy
--   - Exception handling
--   - Any non-escalation code path
--
-- Spec refs:
--   02-state-machines.md §3
--   01-core-architecture-specification.md §9
--   ADR: Phase 4 Task 3.1A, Decision 2
-- ============================================================================

DROP FUNCTION IF EXISTS public.approve_return_intent(UUID, UUID, UUID);

CREATE OR REPLACE FUNCTION public.approve_return_intent(
    p_order_item_id UUID,
    p_vendor_id UUID,
    p_customer_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
SET search_path = public, pg_temp
AS $$
DECLARE
    -- order item
    v_order_item RECORD;
    v_order_item_status text;
    v_order_item_vendor_id UUID;
    v_ledger_entry_id UUID;
    -- order
    v_order RECORD;
    v_order_customer_id UUID;
    v_order_payment_id UUID;
    -- payment
    v_payment RECORD;
    v_payment_vendor_earnings BIGINT;
    v_payment_platform_commission BIGINT;
    -- vendor
    v_vendor_withdrawable_balance BIGINT;
    v_projected_balance_paise BIGINT;
    v_requires_escalation BOOLEAN;
    
    -- escalation
    v_escalation RECORD;
    
    -- refund calculation
    v_refund_amount_paise BIGINT;
    
    -- reversal calculation
    v_vendor_reversal_paise BIGINT;
    
    -- operation key
    v_operation_key TEXT;
    
    -- escalation id
    v_escalation_id UUID;
    
    -- idempotency flag
    v_is_idempotent_replay BOOLEAN := false;
    
    -- timestamps
    v_now TIMESTAMPTZ := now();
    
    -- response variables
    v_error_code TEXT;
    v_response_data JSONB;
    v_response JSONB := jsonb_build_object('success', false, 'data', null, 'isIdempotentReplay', false, 'errorCode', 'NOT_IMPLEMENTED');
BEGIN
    -------------------------------------------------------------------------
    -- 1. Authorization
    -------------------------------------------------------------------------
    -- This RPC is service_role-only and is invoked exclusively by trusted 
    -- Edge Functions. There is no caller-identity resolution step here — 
    -- service_role execution is itself the authorization boundary.
    -- Zero-trust applies instead to the *data* in Section 2.

    -------------------------------------------------------------------------
    -- 2. Validation & Ownership Verification
    -------------------------------------------------------------------------
    -- 1. Fetch the order item
    SELECT * INTO v_order_item
    FROM public.order_items
    WHERE id = p_order_item_id
    FOR UPDATE;

    IF v_order_item IS NULL THEN
        v_response := jsonb_set(v_response, '{errorCode}', '"NOT_FOUND"');
        RETURN v_response;
    END IF;

    -- 2. Validate return status (Idempotency Guard)
    -- If the return has already transitioned past 'requested', we treat it as an idempotent replay
    -- and bypass the remaining financial mutations.
    --
    -- Architecture alignment (Task 2.8): 'escalated' replaces the previously misused 'approved'
    -- for the escalation path. 'approved' is now reserved exclusively for the terminal state
    -- set by create_return_refund_confirm.
    IF v_order_item.return_status IN ('reversing', 'escalated') THEN
        v_is_idempotent_replay := true;
    ELSIF v_order_item.return_status <> 'requested' THEN
        v_response := jsonb_set(v_response, '{errorCode}', '"VALIDATION_FAILED"');
        RETURN v_response;
    END IF;

    -- 3. Fetch the parent order
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = v_order_item.order_id;

    IF v_order IS NULL THEN
        v_response := jsonb_set(v_response, '{errorCode}', '"NOT_FOUND"');
        RETURN v_response;
    END IF;

    -- 4. Vendor verification
    IF v_order_item.vendor_id <> p_vendor_id THEN
        v_response := jsonb_set(v_response, '{errorCode}', '"FORBIDDEN"');
        RETURN v_response;
    END IF;

    -- 5. Customer verification
    IF v_order.customer_id <> p_customer_id THEN
        v_response := jsonb_set(v_response, '{errorCode}', '"FORBIDDEN"');
        RETURN v_response;
    END IF;

    -- 6. Preserve data for later sections
    v_order_item_status := v_order_item.return_status;
    v_order_item_vendor_id := v_order_item.vendor_id;
    v_order_customer_id := v_order.customer_id;
    v_order_payment_id := v_order.payment_id;

    -------------------------------------------------------------------------
    -- 3. Commission & Refund Calculation
    -------------------------------------------------------------------------
    IF NOT v_is_idempotent_replay THEN
    -- Retrieve the canonical payment record for the validated order
    SELECT * INTO v_payment
    FROM public.payments
    WHERE id = v_order_payment_id;

    IF v_payment IS NULL THEN
        v_response := jsonb_set(v_response, '{errorCode}', '"PAYMENT_NOT_FOUND"');
        RETURN v_response;
    END IF;

    -- Store for reference in paise
    -- Retained ROUND(x * 100) because payments stores values as NUMERIC (rupees)
    v_payment_vendor_earnings := ROUND(v_payment.vendor_earnings * 100)::BIGINT;
    v_payment_platform_commission := ROUND(v_payment.platform_commission * 100)::BIGINT;

    -- Determine the full refund amount in integer paise
    -- Retained ROUND(x * 100) because order_items.price is NUMERIC (rupees)
    v_refund_amount_paise := ROUND(v_order_item.price * v_order_item.quantity * 100)::BIGINT;

    -- Retrieve canonical vendor earnings directly from the ledger to completely 
    -- avoid duplicate arithmetic and preserve exact Phase 3 calculations.
    -- type = 'credit' natively isolates the initial earning as adjustments use distinct enum values.
    SELECT id, amount_paise INTO v_ledger_entry_id, v_vendor_reversal_paise
    FROM public.ledger_entries
    WHERE order_item_id = p_order_item_id
      AND type = 'credit'
      AND status = 'confirmed'
    ORDER BY created_at DESC, id DESC
    LIMIT 1;

    IF v_vendor_reversal_paise IS NULL THEN
        v_response := jsonb_set(v_response, '{errorCode}', '"LEDGER_ENTRY_MISSING"');
        RETURN v_response;
    END IF;

    -------------------------------------------------------------------------
    -- 4. Balance Check
    -------------------------------------------------------------------------
    -- Retrieve the vendor's canonical withdrawable balance (which is stored in paise)
    SELECT withdrawable_balance INTO v_vendor_withdrawable_balance
    FROM public.vendors
    WHERE id = v_order_item_vendor_id
    FOR UPDATE;

    IF v_vendor_withdrawable_balance IS NULL THEN
        v_response := jsonb_set(v_response, '{errorCode}', '"VENDOR_NOT_FOUND"');
        RETURN v_response;
    END IF;

    -- Compute the projected post-reversal balance without writing to the database
    v_projected_balance_paise := v_vendor_withdrawable_balance - v_vendor_reversal_paise;
    
    -- Set the escalation flag based strictly on the projected balance
    v_requires_escalation := v_projected_balance_paise < 0;

    -------------------------------------------------------------------------
    -- 5. Atomic State Transition
    -------------------------------------------------------------------------
    IF NOT v_requires_escalation THEN
        -- 1. Generate canonical operation key (only required for ledger mutations)
        v_operation_key := 'rtn_' || gen_random_uuid()::text;

        -- 2. Transition order item
        -- Row lock was exclusively acquired in Section 2, but we defensively 
        -- verify the state hasn't been corrupted before mutation.
        UPDATE public.order_items
        SET return_status = 'reversing'
        WHERE id = p_order_item_id
          AND return_status = v_order_item_status;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'state_transition_conflict';
        END IF;

        -- 3. Create pending reversal ledger entry
        -- Insertion natively reserves funds via the ledger projection trigger
        INSERT INTO public.ledger_entries (
            vendor_id,
            order_id,
            order_item_id,
            type,
            status,
            amount_paise,
            operation_key
        ) VALUES (
            v_order_item_vendor_id,
            v_order.id,
            p_order_item_id,
            'reversal'::ledger_entry_type,
            'pending'::ledger_entry_status,
            v_vendor_reversal_paise,
            v_operation_key
        );
    ELSE
        -- 2. Transition the order item into the canonical escalation state.
        --
        -- Architecture alignment (Task 2.8): the canonical state for an
        -- escalated return is 'escalated', per 02-state-machines.md §3.
        -- The prior implementation used 'approved' here as a pragmatic
        -- workaround pending this constraint expansion — that drift is now
        -- closed.
        UPDATE public.order_items
        SET return_status = 'escalated'
        WHERE id = p_order_item_id
          AND return_status = v_order_item_status;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'state_transition_conflict';
        END IF;

        -- 3 & 4. Create the payment escalation preserving canonical financial context
        -- We deliberately do NOT reserve funds or write to the ledger here.
        -- Instead, we natively link back to the exact initial credit ledger entry.
        INSERT INTO public.payment_escalations (
            ledger_entry_id,
            vendor_id,
            reason,
            status
        ) VALUES (
            v_ledger_entry_id,
            v_order_item_vendor_id,
            'insufficient_balance'::escalation_reason,
            'open'::escalation_status
        ) RETURNING * INTO v_escalation;
    END IF;

    END IF; -- END Idempotency Guard

    -------------------------------------------------------------------------
    -- 6. Response Construction
    -------------------------------------------------------------------------
    IF v_is_idempotent_replay THEN
        -- Hydrate replay data based on the current intercepted state
        IF v_order_item_status = 'reversing' THEN
            SELECT amount_paise, operation_key INTO v_vendor_reversal_paise, v_operation_key
            FROM public.ledger_entries
            WHERE order_item_id = p_order_item_id
              AND type = 'reversal'
              AND status IN ('pending', 'confirmed')
            ORDER BY created_at DESC, id DESC LIMIT 1;
        -- Architecture alignment (Task 2.8): replay branch now correctly
        -- identifies the escalation state as 'escalated', not 'approved'.
        ELSIF v_order_item_status = 'escalated' THEN
            SELECT id INTO v_escalation_id
            FROM public.payment_escalations
            WHERE ledger_entry_id = (
                SELECT id FROM public.ledger_entries 
                WHERE order_item_id = p_order_item_id AND type = 'credit' AND status = 'confirmed' 
                ORDER BY created_at DESC, id DESC LIMIT 1
            )
            ORDER BY created_at DESC LIMIT 1;
            
            SELECT amount_paise INTO v_vendor_reversal_paise
            FROM public.ledger_entries
            WHERE order_item_id = p_order_item_id
              AND type = 'credit'
              AND status = 'confirmed'
            ORDER BY created_at DESC, id DESC
            LIMIT 1;
        END IF;
    ELSE
        -- Fresh execution: sync the response state with our mutations
        IF NOT v_requires_escalation THEN
            v_order_item_status := 'reversing';
        ELSE
            -- Architecture alignment (Task 2.8): response status now correctly
            -- reflects 'escalated' for the escalation path.
            v_order_item_status := 'escalated';
            v_escalation_id := v_escalation.id;
        END IF;
    END IF;

    -- Build the canonical response data object
    v_response_data := jsonb_build_object(
        'orderItemId', p_order_item_id,
        'paymentId', v_order_payment_id,
        'status', v_order_item_status,
        'amountPaise', v_vendor_reversal_paise,
        'operationKey', v_operation_key,
        'escalationId', v_escalation_id
    );

    v_response := jsonb_build_object(
        'success', true,
        'data', v_response_data,
        'isIdempotentReplay', v_is_idempotent_replay,
        'errorCode', NULL
    );

    RETURN v_response;

    -------------------------------------------------------------------------
    -- 7. Error Handling
    -------------------------------------------------------------------------
EXCEPTION
    -- Normalize transient locking failures into canonical conflicts
    WHEN serialization_failure OR deadlock_detected THEN
        RAISE WARNING '[approve_return_intent] Concurrency failure for order_item %: % (SQLSTATE: %)', p_order_item_id, SQLERRM, SQLSTATE;
        v_response := jsonb_build_object('success', false, 'data', null, 'isIdempotentReplay', false, 'errorCode', 'CONFLICT');
        RETURN v_response;
        
    -- Normalize unique constraints (e.g. concurrent identical inserts)
    WHEN unique_violation THEN
        RAISE WARNING '[approve_return_intent] Unique constraint violation for order_item %: % (SQLSTATE: %)', p_order_item_id, SQLERRM, SQLSTATE;
        v_response := jsonb_build_object('success', false, 'data', null, 'isIdempotentReplay', false, 'errorCode', 'CONFLICT');
        RETURN v_response;
        
    -- Normalize data integrity failures
    WHEN check_violation OR foreign_key_violation THEN
        RAISE WARNING '[approve_return_intent] Data integrity violation for order_item %: % (SQLSTATE: %)', p_order_item_id, SQLERRM, SQLSTATE;
        v_response := jsonb_build_object('success', false, 'data', null, 'isIdempotentReplay', false, 'errorCode', 'VALIDATION_FAILED');
        RETURN v_response;

    -- Catch-all for unexpected database failures
    WHEN OTHERS THEN
        -- Safely trap our manually raised optimistic lock conflicts
        IF SQLERRM = 'state_transition_conflict' THEN
            v_response := jsonb_build_object('success', false, 'data', null, 'isIdempotentReplay', false, 'errorCode', 'CONFLICT');
            RETURN v_response;
        END IF;

        -- For completely unknown failures, suppress postgres internals from the API client 
        -- but preserve them in standard output/logs for operators.
        RAISE WARNING '[approve_return_intent] Transaction failed for order_item %: % (SQLSTATE: %)', p_order_item_id, SQLERRM, SQLSTATE;
        v_response := jsonb_build_object('success', false, 'data', null, 'isIdempotentReplay', false, 'errorCode', 'INTERNAL_ERROR');
        RETURN v_response;
END;
$$;

REVOKE ALL
ON FUNCTION public.approve_return_intent(UUID, UUID, UUID)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.approve_return_intent(UUID, UUID, UUID)
TO service_role;

COMMENT ON FUNCTION public.approve_return_intent(UUID, UUID, UUID)
IS 'Canonical return approval intent RPC. Transitions return_status to ''reversing'' (sufficient balance) or ''escalated'' (insufficient balance requiring finance_admin resolution). Idempotent via FOR UPDATE lock + status guard. Architecture-aligned in Task 2.8: ''escalated'' is now the exclusive escalation state; ''approved'' is reserved for the terminal state set by create_return_refund_confirm.';
