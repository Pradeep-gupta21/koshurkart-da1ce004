-- Phase 4 Task 3.9 - Structural skeleton for create_return_refund_confirm.

CREATE OR REPLACE FUNCTION public.create_return_refund_confirm(
    p_order_item_id uuid,
    p_razorpay_refund_id text
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
    
    -- state tracking
    v_is_idempotent_replay BOOLEAN := false;
    
    -- ledger provenance lookup
    v_ledger_row_count INTEGER;
    v_ledger_entry_id UUID;
    v_ledger_razorpay_reference_id TEXT;
    v_operation_key TEXT;
    v_order_item_rows_updated INTEGER;
    
    -- reversal prerequisite verification
    v_reversal_row_count INTEGER;
    v_reversal_ledger_razorpay_reference_id TEXT;

    -- canonical identities
    v_razorpay_refund_id TEXT;

    -- financial calculations
    v_refund_amount_paise BIGINT;
BEGIN
    -------------------------------------------------------------------------
    -- 1. Authorization
    -------------------------------------------------------------------------
    -- RPC execution is restricted to service_role.
    -- Authentication/provider verification belongs to the trusted orchestration boundary.

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

    IF p_razorpay_refund_id IS NULL OR trim(p_razorpay_refund_id) = '' THEN
        RETURN jsonb_build_object(
            'success', false,
            'data', null,
            'isIdempotentReplay', false,
            'errorCode', 'VALIDATION_MISSING_RAZORPAY_REFUND_ID'
        );
    END IF;

    v_razorpay_refund_id := trim(p_razorpay_refund_id);

    -- Canonical row lock on the order_item for the refund flow.
    -- This guarantees concurrent refund webhooks for the same item serialize.
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
    -- 'vendor_id' is ON DELETE SET NULL in the schema. However, vendors with historical
    -- financial ledger entries cannot be deleted because ledger_entries.vendor_id enforces
    -- strict referential integrity. Therefore, refund confirmation can safely bind provenance
    -- using the canonical vendor_id without risk of it evaluating to NULL.
    IF v_order_item.order_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'data', null,
            'isIdempotentReplay', false,
            'errorCode', 'VALIDATION_FAILED'
        );
    END IF;

    -- State Validation Boundary
    -- 1. 'refunding': Fresh execution candidate (reversal was already confirmed).
    -- 2. 'approved': Potential replay candidate (refund was already confirmed).
    -- Everything else: Invalid state.
    IF v_order_item.return_status = 'refunding' THEN
        -- Potential fresh execution: proceed to idempotency/provenance (Task 3.11)
        NULL;
    ELSIF v_order_item.return_status = 'approved' THEN
        -- Potential replay candidate: proceed to idempotency/provenance (Task 3.11)
        -- Task 3.11 must prove the stored refund provenance matches the incoming ID.
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
    -- 3. Idempotency & Refund Provenance
    -------------------------------------------------------------------------
    IF v_order_item.return_status = 'refunding' THEN
        -- A. FRESH EXECUTION
        -- 1. Validate that the Razorpay refund ID hasn't been set yet (corruption guard).
        -- A refunding item MUST NOT have a prior refund provider ID.
        IF v_order_item.razorpay_refund_id IS NOT NULL THEN
            RETURN jsonb_build_object(
                'success', false,
                'data', null,
                'isIdempotentReplay', false,
                'errorCode', 'CONFLICT'
            );
        END IF;

    ELSIF v_order_item.return_status = 'approved' THEN
        -- B. IDEMPOTENT REPLAY
        -- 1. Validate the incoming Razorpay refund ID against the stored provenance.
        -- This proves this execution is a legitimate replay of the EXACT same transaction.
        -- Never infer replay from 'approved' alone.
        IF v_order_item.razorpay_refund_id IS DISTINCT FROM v_razorpay_refund_id THEN
            RETURN jsonb_build_object(
                'success', false,
                'data', null,
                'isIdempotentReplay', false,
                'errorCode', 'CONFLICT'
            );
        END IF;

        -- 2. Prove exactly ONE canonical confirmed refund ledger row exists.
        -- Binding order_id ensures exact context.
        -- vendor_id IS NULL enforces this is a platform-level customer refund.
        -- No FOR UPDATE is needed here since confirmed ledger entries are immutable audit records.
        WITH candidate_rows AS (
            SELECT
                COUNT(*) OVER () as total_rows,
                id,
                razorpay_reference_id,
                operation_key
            FROM public.ledger_entries
            WHERE order_item_id = p_order_item_id
              AND order_id = v_order_item.order_id
              AND vendor_id IS NULL
              AND type = 'refund'
              AND status = 'confirmed'
        )
        SELECT
            total_rows,
            id,
            razorpay_reference_id,
            operation_key
        INTO
            v_ledger_row_count,
            v_ledger_entry_id,
            v_ledger_razorpay_reference_id,
            v_operation_key
        FROM candidate_rows
        LIMIT 1;

        IF NOT FOUND OR v_ledger_row_count <> 1 THEN
            -- 0 rows or >1 rows both indicate a missing or corrupted canonical record.
            RETURN jsonb_build_object(
                'success', false,
                'data', null,
                'isIdempotentReplay', false,
                'errorCode', 'CONFLICT'
            );
        END IF;

        -- 3. Validate ledger row provenance matches the incoming Razorpay refund ID.
        IF v_ledger_razorpay_reference_id IS DISTINCT FROM v_razorpay_refund_id THEN
            RETURN jsonb_build_object(
                'success', false,
                'data', null,
                'isIdempotentReplay', false,
                'errorCode', 'CONFLICT'
            );
        END IF;

        -- Replay proven. Hydrated v_ledger_entry_id and v_operation_key are now available for Section 7.
        v_is_idempotent_replay := true;
    END IF;

    -------------------------------------------------------------------------
    -- 4. Reversal Prerequisite Verification
    -------------------------------------------------------------------------
    IF NOT v_is_idempotent_replay THEN
        -- A customer refund MUST NEVER be confirmed unless the corresponding vendor reversal is already confirmed.
        
        -- 1. Validate order-item reversal provenance
        IF v_order_item.razorpay_reversal_id IS NULL OR trim(v_order_item.razorpay_reversal_id) = '' THEN
            RETURN jsonb_build_object(
                'success', false,
                'data', null,
                'isIdempotentReplay', false,
                'errorCode', 'CONFLICT'
            );
        END IF;

        -- 2. Prove exactly ONE canonical confirmed reversal ledger row exists.
        WITH candidate_reversals AS (
            SELECT
                id,
                razorpay_reference_id
            FROM public.ledger_entries
            WHERE order_item_id = p_order_item_id
              AND order_id = v_order_item.order_id
              AND vendor_id = v_order_item.vendor_id
              AND type = 'reversal'
              AND status = 'confirmed'
        )
        SELECT
            COUNT(*),
            MIN(razorpay_reference_id)
        INTO
            v_reversal_row_count,
            v_reversal_ledger_razorpay_reference_id
        FROM candidate_reversals;

        IF v_reversal_row_count <> 1 THEN
            -- 0 rows or >1 rows both indicate missing or corrupted reversal context.
            RETURN jsonb_build_object(
                'success', false,
                'data', null,
                'isIdempotentReplay', false,
                'errorCode', 'CONFLICT'
            );
        END IF;

        -- 3. Validate ledger row provenance against the order item reversal provenance.
        -- Reject NULL/blank ledger provider references.
        IF v_reversal_ledger_razorpay_reference_id IS NULL OR trim(v_reversal_ledger_razorpay_reference_id) = '' THEN
            RETURN jsonb_build_object(
                'success', false,
                'data', null,
                'isIdempotentReplay', false,
                'errorCode', 'CONFLICT'
            );
        END IF;

        IF trim(v_reversal_ledger_razorpay_reference_id) IS DISTINCT FROM trim(v_order_item.razorpay_reversal_id) THEN
            RETURN jsonb_build_object(
                'success', false,
                'data', null,
                'isIdempotentReplay', false,
                'errorCode', 'CONFLICT'
            );
        END IF;
    END IF;

    -------------------------------------------------------------------------
    -- 5. Canonical Refund Ledger Recording
    -------------------------------------------------------------------------
    IF NOT v_is_idempotent_replay THEN
        -- 1. Corruption Guard: Ensure NO refund ledger row exists yet.
        -- We must fail closed if historical/corrupt refund provenance already exists for a 'refunding' state.
        PERFORM 1
        FROM public.ledger_entries
        WHERE order_item_id = p_order_item_id
          AND type = 'refund'
          AND vendor_id IS NULL
          AND status = 'confirmed';

        IF FOUND THEN
            RETURN jsonb_build_object(
                'success', false,
                'data', null,
                'isIdempotentReplay', false,
                'errorCode', 'CONFLICT'
            );
        END IF;

        -- 2. Calculate the canonical customer refund amount.
        -- Source of truth: the exact original per-line customer charge basis.
        v_refund_amount_paise := ROUND(v_order_item.price * v_order_item.quantity * 100)::BIGINT;

        IF v_refund_amount_paise IS NULL OR v_refund_amount_paise <= 0 THEN
            RETURN jsonb_build_object(
                'success', false,
                'data', null,
                'isIdempotentReplay', false,
                'errorCode', 'INTERNAL_ERROR'
            );
        END IF;

        -- 3. Generate canonical OPAQUE operation key.
        -- Operation keys are repository-proven as opaque generated identifiers (e.g. 'chk_...', 'rtn_...').
        -- Idempotency is independently guaranteed by the Section 2 FOR UPDATE lock + state machine transition.
        v_operation_key := 'rfd_' || gen_random_uuid()::text;

        -- 4. Insert Exactly ONE Customer Refund Ledger Entry.
        -- The amount is the exact integer paise customer charge.
        -- vendor_id is explicitly NULL to bypass vendor balance projection logic.
        INSERT INTO public.ledger_entries (
            vendor_id,
            order_id,
            order_item_id,
            type,
            status,
            amount_paise,
            operation_key,
            razorpay_reference_id,
            confirmed_at
        ) VALUES (
            NULL,
            v_order_item.order_id,
            p_order_item_id,
            'refund'::ledger_entry_type,
            'confirmed'::ledger_entry_status,
            v_refund_amount_paise,
            v_operation_key,
            v_razorpay_refund_id,
            now()
        ) RETURNING id INTO v_ledger_entry_id;

        -- Use GET DIAGNOSTICS as a strong row-count assertion in addition to the RETURNING clause.
        GET DIAGNOSTICS v_ledger_row_count = ROW_COUNT;
        IF v_ledger_row_count <> 1 OR v_ledger_entry_id IS NULL THEN
            -- Abort transaction, trigger exception boundary.
            RAISE EXCEPTION 'refund_ledger_insert_failed' USING ERRCODE = 'P0001';
        END IF;
    END IF;

    -------------------------------------------------------------------------
    -- 6. Atomic Terminal Return State Transition
    -------------------------------------------------------------------------
    IF NOT v_is_idempotent_replay THEN
        UPDATE public.order_items
        SET return_status = 'approved',
            razorpay_refund_id = v_razorpay_refund_id
        WHERE id = p_order_item_id
          AND return_status = 'refunding'
          AND razorpay_refund_id IS NULL;

        GET DIAGNOSTICS v_order_item_rows_updated = ROW_COUNT;
        IF v_order_item_rows_updated <> 1 THEN
            -- Raising an exception here atomically rolls back the Task 3.13 ledger confirmation.
            RAISE EXCEPTION 'order_item_transition_failed' USING ERRCODE = 'P0001';
        END IF;
    END IF;

    -------------------------------------------------------------------------
    -- 7. Response / Replay Hydration
    -------------------------------------------------------------------------
    -- Both fresh execution and valid idempotent replay reach this point having proven
    -- or successfully mutated the canonical authoritative state.
    -- We construct the response exactly matching the proven post-mutation state.
    -- The RECORD v_order_item may hold stale data (e.g. return_status = 'refunding'
    -- if this was a fresh execution) so we rely on the proven terminal postcondition 'approved'.

    RETURN jsonb_build_object(
        'success', true,
        'data', jsonb_build_object(
            'orderItemId', p_order_item_id,
            'returnStatus', 'approved',
            'razorpayRefundId', v_razorpay_refund_id,
            'ledgerEntryId', v_ledger_entry_id,
            'operationKey', v_operation_key
        ),
        'isIdempotentReplay', v_is_idempotent_replay,
        'errorCode', null
    );

    -------------------------------------------------------------------------
    -- 8. Error & Concurrency Normalization
    -------------------------------------------------------------------------
EXCEPTION
    WHEN serialization_failure OR deadlock_detected OR lock_not_available THEN
        RAISE; -- Preserve Phase 4 architectural retryable SQLSTATE re-raise behavior

    WHEN unique_violation THEN
        RAISE WARNING '[return_refund_confirmation_failure] Unique constraint violation for order_item %: % (SQLSTATE: %)', 
            p_order_item_id, SQLERRM, SQLSTATE;
        RETURN jsonb_build_object(
            'success', false,
            'data', null,
            'isIdempotentReplay', false,
            'errorCode', 'CONFLICT'
        );

    WHEN check_violation OR foreign_key_violation THEN
        RAISE WARNING '[return_refund_confirmation_failure] Data integrity violation for order_item %: % (SQLSTATE: %)', 
            p_order_item_id, SQLERRM, SQLSTATE;
        RETURN jsonb_build_object(
            'success', false,
            'data', null,
            'isIdempotentReplay', false,
            'errorCode', 'VALIDATION_FAILED'
        );

    WHEN raise_exception THEN
        -- Explicitly raised conflicts (e.g., failed defensive UPDATEs) are safely discriminated by message.
        -- This guarantees the PL/pgSQL subtransaction is fully rolled back before returning CONFLICT.
        IF SQLERRM IN ('refund_ledger_insert_failed', 'order_item_transition_failed') THEN
            RAISE WARNING '[return_refund_confirmation_conflict] Defensive invariant failure for order_item %: % (SQLSTATE: %)',
                p_order_item_id, SQLERRM, SQLSTATE;
            RETURN jsonb_build_object(
              'success', false,
              'data', null,
              'isIdempotentReplay', false,
              'errorCode', 'CONFLICT'
            );
        END IF;
        
        -- Unknown P0001 exceptions are treated as unexpected internal errors to prevent leaking programmer errors.
        RAISE WARNING '[return_refund_confirmation_failure] Unhandled raise_exception in create_return_refund_confirm (order_item_id: %). SQLSTATE: %, SQLERRM: %',
            p_order_item_id, SQLSTATE, SQLERRM;
        RETURN jsonb_build_object(
          'success', false,
          'data', null,
          'isIdempotentReplay', false,
          'errorCode', 'INTERNAL_ERROR'
        );

    WHEN OTHERS THEN
        RAISE WARNING '[return_refund_confirmation_failure] Unhandled exception in create_return_refund_confirm (order_item_id: %). SQLSTATE: %, SQLERRM: %',
            p_order_item_id, SQLSTATE, SQLERRM;
        RETURN jsonb_build_object(
            'success', false,
            'data', null,
            'isIdempotentReplay', false,
            'errorCode', 'INTERNAL_ERROR'
        );
END;
$$;

REVOKE ALL ON FUNCTION public.create_return_refund_confirm(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_return_refund_confirm(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_return_refund_confirm(uuid, text) TO service_role;
