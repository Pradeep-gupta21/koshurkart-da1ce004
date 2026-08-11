-- Migration: 20260809144300_fix_approve_return_intent_reversal_replay.sql
-- Fixes replay lookup logic inside approve_return_intent to strictly require
-- status = 'pending' instead of accepting corrupt states.

CREATE OR REPLACE FUNCTION public.approve_return_intent(
    p_order_item_id UUID,
    p_auth_user_id  UUID    -- auth.users.id supplied by the Edge Function
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
SET search_path = public, pg_temp
AS $$
DECLARE
    -- vendor resolution
    v_vendor_id UUID;
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
    -- Executed by service_role only (see grants below).
    -- Zero-trust is enforced via data lookups in sections 2 and 3.

    -------------------------------------------------------------------------
    -- 2. Identity Resolution — auth.users.id → vendors.id
    -------------------------------------------------------------------------
    -- Resolve the caller's auth UID to a vendors row BEFORE acquiring any
    -- lock.  A caller with no vendor record must never hold a row lock on
    -- order_items — fail fast to avoid unnecessary contention.
    SELECT id INTO v_vendor_id
    FROM public.vendors
    WHERE user_id = p_auth_user_id;

    IF NOT FOUND THEN
        RAISE WARNING '[approve_return_intent] No vendor row for auth uid %', p_auth_user_id;
        v_response := jsonb_set(v_response, '{errorCode}', '"FORBIDDEN"');
        RETURN v_response;
    END IF;

    -------------------------------------------------------------------------
    -- 3. Validation & Ownership Verification
    -------------------------------------------------------------------------
    -- 1. Fetch the order item (row lock — vendor identity already resolved)
    SELECT * INTO v_order_item
    FROM public.order_items
    WHERE id = p_order_item_id
    FOR UPDATE;

    IF v_order_item IS NULL THEN
        v_response := jsonb_set(v_response, '{errorCode}', '"NOT_FOUND"');
        RETURN v_response;
    END IF;

    -- 2. Vendor ownership verification (Zero-Trust, under lock)
    --    Compare resolved vendors.id against order_items.vendor_id.
    IF v_order_item.vendor_id IS DISTINCT FROM v_vendor_id THEN
        v_response := jsonb_set(v_response, '{errorCode}', '"FORBIDDEN"');
        RETURN v_response;
    END IF;

    -- 3. Validate return status (Idempotency Guard)
    -- If the return has already transitioned past 'requested', we treat it as an idempotent replay
    -- and bypass the remaining financial mutations.
    --
    -- Architecture alignment (Task 2.8): 'escalated' replaces the previously misused 'approved'
    -- for the escalation path. 'approved' is now reserved exclusively for the terminal state
    -- set by create_return_refund_confirm.
    IF v_order_item.return_status IN ('reversing', 'escalated') THEN
        v_is_idempotent_replay := true;
    ELSIF v_order_item.return_status IS DISTINCT FROM 'requested' THEN
        v_response := jsonb_set(v_response, '{errorCode}', '"VALIDATION_FAILED"');
        RETURN v_response;
    END IF;

    -- 4. Fetch the parent order
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = v_order_item.order_id;

    IF v_order IS NULL THEN
        v_response := jsonb_set(v_response, '{errorCode}', '"NOT_FOUND"');
        RETURN v_response;
    END IF;

    -- 5. Preserve data for later sections
    v_order_item_status := v_order_item.return_status;
    v_order_item_vendor_id := v_order_item.vendor_id;
    v_order_customer_id := v_order.user_id;
    
    -- Canonical payment row is resolved independently of its mutable payment status
    -- to support idempotent replay correctly when payment state changes.
    -- Architectural Invariant: The system guarantees exactly ONE payment record
    -- per order via atomic order+payment creation in checkout flows (RPC & Edge).
    -- Therefore, ORDER BY created_at DESC correctly resolves the single canonical row.
    SELECT id INTO v_order_payment_id
    FROM public.payments
    WHERE order_id = v_order.id
    ORDER BY 
        CASE WHEN payment_status = 'success' THEN 0 ELSE 1 END,
        created_at DESC NULLS LAST, 
        id DESC 
    LIMIT 1;

    IF v_order_payment_id IS NULL THEN
        RAISE WARNING '[approve_return_intent] Missing payment for order %', v_order.id;
        v_response := jsonb_build_object('success', false, 'data', null, 'isIdempotentReplay', false, 'errorCode', 'PAYMENT_NOT_FOUND');
        RETURN v_response;
    END IF;

    -------------------------------------------------------------------------
    -- 4. Commission & Refund Calculation
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

    -- Status validation is applied only during the fresh execution path.
    -- Uses IS DISTINCT FROM to ensure NULL safety (NULL is treated as distinct from 'success')
    IF v_payment.payment_status IS DISTINCT FROM 'success' THEN
        RAISE WARNING '[approve_return_intent] Payment % for order % has invalid status %', v_order_payment_id, v_order.id, v_payment.payment_status;
        v_response := jsonb_build_object('success', false, 'data', null, 'isIdempotentReplay', false, 'errorCode', 'PAYMENT_NOT_FOUND');
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
    -- 5. Balance Check
    -------------------------------------------------------------------------
    -- Retrieve the vendor's canonical withdrawable balance (which is stored in paise)
    -- FOR UPDATE on vendors is intentional here: it gates the financial mutation.
    -- v_order_item_vendor_id is already ownership-verified against v_vendor_id above.
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
    -- 6. Atomic State Transition
    -------------------------------------------------------------------------
    IF NOT v_requires_escalation THEN
        -- 1. Generate canonical operation key (only required for ledger mutations)
        v_operation_key := 'rtn_' || gen_random_uuid()::text;

        -- 2. Transition order item
        -- Row lock was exclusively acquired in Section 3, but we defensively 
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
        UPDATE public.order_items
        SET return_status = 'escalated'
        WHERE id = p_order_item_id
          AND return_status = v_order_item_status;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'state_transition_conflict';
        END IF;

        -- 3 & 4. Create the payment escalation preserving canonical financial context
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
    -- 7. Response Construction
    -------------------------------------------------------------------------
    IF v_is_idempotent_replay THEN
        -- Hydrate replay data based on the current intercepted state
        IF v_order_item_status = 'reversing' THEN
            SELECT amount_paise, operation_key INTO v_vendor_reversal_paise, v_operation_key
            FROM public.ledger_entries
            WHERE order_item_id = p_order_item_id
              AND type = 'reversal'
              AND status = 'pending'
            ORDER BY created_at DESC, id DESC LIMIT 1;

            IF v_vendor_reversal_paise IS NULL OR v_operation_key IS NULL THEN
                v_response := jsonb_build_object('success', false, 'data', null, 'isIdempotentReplay', true, 'errorCode', 'INTERNAL_ERROR');
                RETURN v_response;
            END IF;
        ELSIF v_order_item_status = 'escalated' THEN
            SELECT
                pe.id,
                le.amount_paise
            INTO
                v_escalation_id,
                v_vendor_reversal_paise
            FROM public.payment_escalations pe
            JOIN public.ledger_entries le
                ON le.id = pe.ledger_entry_id
            WHERE pe.vendor_id = v_order_item_vendor_id
              AND le.order_item_id = p_order_item_id
              AND le.type = 'credit'
            ORDER BY
                pe.created_at DESC,
                pe.id DESC
            LIMIT 1;

            IF v_escalation_id IS NULL OR v_vendor_reversal_paise IS NULL THEN
                v_response := jsonb_build_object('success', false, 'data', null, 'isIdempotentReplay', true, 'errorCode', 'INTERNAL_ERROR');
                RETURN v_response;
            END IF;
        END IF;
    ELSE
        -- Fresh execution: sync the response state with our mutations
        IF NOT v_requires_escalation THEN
            v_order_item_status := 'reversing';
        ELSE
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
    -- 8. Error Handling — unchanged from prior version
    -------------------------------------------------------------------------
EXCEPTION
    -- Preserve retryable SQLSTATE re-raise behavior to allow safe caller retries.
    -- Permanent business conflicts are converted into structured RPC responses (below).
    -- This exact retry policy is shared uniformly across all return-processing RPCs.
    WHEN serialization_failure OR deadlock_detected OR lock_not_available THEN
        RAISE;

    WHEN unique_violation THEN
        RAISE WARNING '[approve_return_intent] Unique constraint violation for order_item %: % (SQLSTATE: %)', p_order_item_id, SQLERRM, SQLSTATE;
        v_response := jsonb_build_object('success', false, 'data', null, 'isIdempotentReplay', false, 'errorCode', 'CONFLICT');
        RETURN v_response;
        
    WHEN check_violation OR foreign_key_violation THEN
        RAISE WARNING '[approve_return_intent] Data integrity violation for order_item %: % (SQLSTATE: %)', p_order_item_id, SQLERRM, SQLSTATE;
        v_response := jsonb_build_object('success', false, 'data', null, 'isIdempotentReplay', false, 'errorCode', 'VALIDATION_FAILED');
        RETURN v_response;

    WHEN OTHERS THEN
        IF SQLERRM = 'state_transition_conflict' THEN
            v_response := jsonb_build_object('success', false, 'data', null, 'isIdempotentReplay', false, 'errorCode', 'CONFLICT');
            RETURN v_response;
        END IF;

        RAISE WARNING '[approve_return_intent] Transaction failed for order_item %: % (SQLSTATE: %)', p_order_item_id, SQLERRM, SQLSTATE;
        v_response := jsonb_build_object('success', false, 'data', null, 'isIdempotentReplay', false, 'errorCode', 'INTERNAL_ERROR');
        RETURN v_response;
END;
$$;

REVOKE ALL
ON FUNCTION public.approve_return_intent(UUID, UUID)
FROM PUBLIC;

REVOKE EXECUTE
ON FUNCTION public.approve_return_intent(UUID, UUID)
FROM anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.approve_return_intent(UUID, UUID)
TO service_role;

COMMENT ON FUNCTION public.approve_return_intent(UUID, UUID)
IS 'Canonical return approval intent RPC.  Accepts auth.users.id and resolves '
   'to vendors.id internally — callers never supply vendors.id directly.  '
   'Transitions return_status to ''reversing'' (sufficient balance) or '
   '''escalated'' (insufficient balance).  Idempotent via FOR UPDATE lock + '
   'status guard.  service_role only.  Pattern B architecture.';
