-- =============================================================================
-- Migration: 20260729171200_canonicalize_vendor_balance_provenance.sql
-- Description: Canonicalize mixed-era vendor balances safely and 
-- restrict payouts to explicitly reconciled vendors.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Safe Schema Introduction
-- -----------------------------------------------------------------------------
-- Establish the fail-closed invariant
ALTER TABLE public.vendors
ADD COLUMN IF NOT EXISTS is_ledger_reconciled BOOLEAN NOT NULL DEFAULT FALSE;

-- Force existing rows to un-reconciled so we can explicitly opt them in
UPDATE public.vendors SET is_ledger_reconciled = FALSE;

-- Introduce canonical unit for payouts while retaining legacy display column
ALTER TABLE public.payouts 
ADD COLUMN IF NOT EXISTS amount_paise BIGINT NULL CHECK (amount_paise IS NULL OR amount_paise > 0);

COMMENT ON COLUMN public.payouts.amount_paise IS 'Canonical integer paise. NULL means an uncanonicalized legacy rupee row for purposes of this migration. Used for backend ledger parity and idempotency.';
COMMENT ON COLUMN public.payouts.amount IS 'Legacy compatibility float (rupees) for UI display. Not to be used for financial comparisons.';



-- -----------------------------------------------------------------------------
-- 2. Snapshot Population B Before Trigger Mutation
-- -----------------------------------------------------------------------------
-- Create an immutable snapshot of candidates.
--
-- Population B eligibility: vendor has a legacy withdrawable_balance but no
-- ledger_entries yet (i.e., was never migrated to the ledger-first architecture).
--
-- PAYOUT-SIDE PROOF — Why pending/processing payouts exclude a vendor:
--
-- The atomic request_payout RPC (20260717000004) RESERVES funds immediately
-- on payout creation (pending state) by deducting from withdrawable_balance.
-- Therefore, if a vendor has a non-terminal payout, the current
-- withdrawable_balance is already reduced by that reserved amount. However,
-- such a payout has NO corresponding ledger entry (it predates the ledger
-- architecture). We cannot create an opening credit that is mathematically
-- sound in both: (a) the case the payout later settles (the credit would
-- over-state inbound earnings) and (b) the case it fails/is-cancelled (the
-- refund trigger would add back to a balance already credited in the ledger).
-- The only safe treatment is fail-closed exclusion.
--
-- CUTOVER PRE-FLIGHT GUARANTEE:
-- Migration 20260729163901 enforces that ALL payouts are in terminal states
-- (completed, failed, rejected, cancelled) before ledger cutover may proceed.
-- Therefore, the pending/processing exclusion below cannot match any row in
-- a correctly ordered migration chain. It exists as a defence-in-depth guard
-- against an incorrectly ordered re-run or a future regression.
--
-- TERMINAL PAYOUTS (completed, failed, cancelled, rejected):
-- Their effect on withdrawable_balance is already fully resolved:
--   - completed: deducted by the legacy trigger (then this trigger was dropped).
--   - failed/rejected/cancelled: refunded by admin_update_payout_status.
-- A Pop-B vendor with only terminal payouts can safely receive an opening
-- credit equal to the current withdrawable_balance.
CREATE TEMP TABLE legacy_balance_candidates ON COMMIT DROP AS
SELECT
    v.id AS vendor_id,
    (v.withdrawable_balance * 100)::BIGINT AS opening_balance_paise
FROM public.vendors v
WHERE v.withdrawable_balance > 0
  AND NOT EXISTS (
      SELECT 1
      FROM public.ledger_entries le
      WHERE le.vendor_id = v.id
  )
  AND NOT EXISTS (
      SELECT 1
      FROM public.payouts p
      WHERE p.vendor_id = v.id
        AND p.status IN ('pending', 'processing')
  );


-- -----------------------------------------------------------------------------
-- 3. Validate Population B Before Conversion
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_invalid_count INT;
BEGIN
  -- Check for precision loss (e.g. 10.123 -> not exactly representable as paise)
  SELECT COUNT(*) INTO v_invalid_count
  FROM public.vendors v
  JOIN legacy_balance_candidates c ON v.id = c.vendor_id
  WHERE (v.withdrawable_balance * 100) <> trunc(v.withdrawable_balance * 100);

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'MIGRATION ABORTED: % legacy vendors have balances with invalid precision. Cannot safely convert to paise.', v_invalid_count;
  END IF;

  -- Check for negative balances across all vendors to enforce the systemic invariant
  SELECT COUNT(*) INTO v_invalid_count
  FROM public.vendors v
  WHERE COALESCE(v.withdrawable_balance, 0) < 0;

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'MIGRATION ABORTED: % vendors have negative balances.', v_invalid_count;
  END IF;

  -- Ensure we haven't already migrated them (idempotency check)
  SELECT COUNT(*) INTO v_invalid_count
  FROM public.ledger_entries
  WHERE operation_key LIKE 'legacy_opening_balance:%';

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'MIGRATION ABORTED: Legacy opening balances already exist in ledger_entries. This migration cannot run twice safely.';
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. Materialize Proven Legacy Opening Balances
-- -----------------------------------------------------------------------------
-- Preflight: Ensure the projection trigger is active. Without this trigger,
-- the following INSERT would fail to convert withdrawable_balance to canonical paise.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_proc p
      ON p.oid = t.tgfoid
    JOIN pg_namespace n
      ON n.oid = p.pronamespace
    WHERE t.tgname = 'trg_recalculate_withdrawable_balance'
      AND t.tgrelid = 'public.ledger_entries'::regclass
      AND NOT t.tgisinternal
      AND t.tgenabled IN ('O', 'A')
      AND n.nspname = 'public'
      AND p.proname = 'recalculate_withdrawable_balance'
  ) THEN
    RAISE EXCEPTION
      'MIGRATION ABORTED: Required enabled ledger projection trigger/function is missing. Population-B canonicalization cannot proceed safely.';
  END IF;
END;
$$;
INSERT INTO public.ledger_entries (
    vendor_id,
    type,
    status,
    amount_paise,
    operation_key
)
SELECT
    vendor_id,
    'credit',
    'confirmed',
    opening_balance_paise,
    'legacy_opening_balance:' || vendor_id::text
FROM legacy_balance_candidates;

-- -----------------------------------------------------------------------------
-- 5. Verify Materialization Before Certification
-- -----------------------------------------------------------------------------
-- INTENTIONAL MID-MIGRATION UNIT TRANSITION:
-- The preceding INSERT synchronously invoked `trg_recalculate_withdrawable_balance`.
-- That trigger recomputed the full projection in integer paise and directly overwrote 
-- `vendors.withdrawable_balance` (transitioning it from legacy rupees to canonical paise).
-- Therefore, the following equality intentionally verifies that this rewrite occurred correctly
-- by comparing the now-paise `withdrawable_balance` against the paise projection.
-- Do NOT multiply withdrawable_balance by 100 here.
DO $$
DECLARE
  v_failed_count INT;
BEGIN
  -- Independently recompute the production projection and assert equality
  SELECT COUNT(*) INTO v_failed_count
  FROM legacy_balance_candidates c
  JOIN public.vendors v ON v.id = c.vendor_id
  WHERE 
    v.withdrawable_balance <> c.opening_balance_paise 
    OR 
    c.opening_balance_paise <> (
      SELECT COALESCE(SUM(
        CASE
          WHEN type IN ('credit', 'refund') AND status = 'confirmed' THEN amount_paise
          WHEN type IN ('debit', 'reservation', 'payout', 'reversal') AND status IN ('pending', 'confirmed') THEN -amount_paise
          ELSE 0
        END
      ), 0)
      FROM public.ledger_entries
      WHERE vendor_id = c.vendor_id
    );

  IF v_failed_count > 0 THEN
    RAISE EXCEPTION 'MIGRATION ABORTED: % Population B vendors failed the post-materialization projection verification.', v_failed_count;
  END IF;
END;
$$;

-- Mark validated Population B vendors as reconciled
UPDATE public.vendors v
SET is_ledger_reconciled = TRUE
FROM legacy_balance_candidates c
WHERE v.id = c.vendor_id;

-- -----------------------------------------------------------------------------
-- 6. Certify Population A
-- -----------------------------------------------------------------------------
UPDATE public.vendors v
SET is_ledger_reconciled = TRUE
WHERE COALESCE(v.withdrawable_balance, 0) = 0
  AND NOT EXISTS (
      SELECT 1
      FROM public.ledger_entries le
      WHERE le.vendor_id = v.id
  );

-- -----------------------------------------------------------------------------
-- 7. Certify Population C (Provably Complete Ledger-Native Vendors)
-- -----------------------------------------------------------------------------
-- ====================================================================
-- INTENTIONAL DUPLICATION — DO NOT DRY
--
-- This certification predicate is deliberately duplicated between this
-- historical cutover migration and test_certify.sql.
--
-- The migration predicate must remain frozen to the exact provenance
-- rules used during this cutover. Do not extract it into a mutable
-- runtime database function/view.
--
-- IMPORTANT:
-- If this predicate is intentionally changed before this migration is
-- finalized/deployed, update the corresponding verification predicate
-- in test_certify.sql and rerun the full certification test matrix.
-- ====================================================================

UPDATE public.vendors v
SET is_ledger_reconciled = TRUE
WHERE 
  -- Must be a ledger-era vendor
  EXISTS (
      SELECT 1
      FROM public.ledger_entries le
      WHERE le.vendor_id = v.id
  )
  
  -- GUARD 1: Fail closed on unproven ledger types
  AND NOT EXISTS (
      SELECT 1 FROM public.ledger_entries le 
      WHERE le.vendor_id = v.id 
        AND le.type NOT IN ('credit', 'reversal', 'payout')
  )

  -- GUARD 1b: Fail closed on unproven ledger statuses
  AND NOT EXISTS (
      SELECT 1 FROM public.ledger_entries le 
      WHERE le.vendor_id = v.id 
        AND le.status NOT IN ('pending', 'confirmed', 'failed')
  )

  -- GUARD 2: Fail closed on unproven historical payout statuses
  AND NOT EXISTS (
      SELECT 1 FROM public.payouts p
      WHERE p.vendor_id = v.id
        AND p.status NOT IN ('pending', 'processing', 'completed', 'failed', 'cancelled', 'rejected')
  )
  
  -- GUARD 3: Inbound precision loss check (total_earnings is in rupees)
  -- Architecture Note: v.total_earnings is natively NUMERIC in Postgres. Multiplying a NUMERIC 
  -- by an integer literal exactly preserves decimal semantics, avoiding floating-point inaccuracy.
  AND (COALESCE(v.total_earnings, 0) * 100) = TRUNC(COALESCE(v.total_earnings, 0) * 100)
  
  -- GUARD 4: Outbound precision loss check (only applies to legacy rupee payouts)
  AND NOT EXISTS (
      SELECT 1 FROM public.payouts p 
      WHERE p.vendor_id = v.id 
        AND p.status IN ('pending', 'processing', 'completed')
        AND p.debited_at IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM public.ledger_entries le WHERE le.payout_id = p.id)
        AND (p.amount * 100) <> TRUNC(p.amount * 100)
  )

  -- WITNESS 1: Inbound flow completeness (total_earnings)
  AND (COALESCE(v.total_earnings, 0) * 100)::BIGINT = (
      SELECT COALESCE(SUM(
          CASE 
              WHEN type = 'credit' AND status = 'confirmed' THEN amount_paise 
              WHEN type = 'reversal' AND status IN ('pending', 'confirmed') THEN -amount_paise 
              ELSE 0 
          END
      ), 0)::BIGINT
      FROM public.ledger_entries
      WHERE vendor_id = v.id
  )

  -- WITNESS 2: Outbound flow completeness (payouts)
  AND (
      SELECT COALESCE(SUM(
        COALESCE(
          p.amount_paise,
          (p.amount * 100)::BIGINT
        )
      ), 0)::BIGINT
      FROM public.payouts p
      WHERE p.vendor_id = v.id 
        AND p.status IN ('pending', 'processing', 'completed')
        AND p.debited_at IS NOT NULL
  ) = (
      SELECT COALESCE(SUM(amount_paise), 0)::BIGINT
      FROM public.ledger_entries
      WHERE vendor_id = v.id 
        AND type = 'payout' 
        AND status IN ('pending', 'confirmed')
  )
  
  -- WITNESS 3: Strict Solvency Consistency (withdrawable_balance)
  -- The stored spendable balance (paise) MUST exactly equal the production projection.
  -- This proves the vendor holds the correct canonical denominator without inflating via *100.
  AND COALESCE(v.withdrawable_balance, 0)::BIGINT = (
      SELECT COALESCE(SUM(
          CASE
            WHEN type = 'credit' AND status = 'confirmed' THEN amount_paise
            WHEN type IN ('payout', 'reversal') AND status IN ('pending', 'confirmed') THEN -amount_paise
            ELSE 0
          END
      ), 0)::BIGINT
      FROM public.ledger_entries le
      WHERE le.vendor_id = v.id
  );

-- All other vendors (Population D) remain FALSE and fail closed.
DO $$
DECLARE
  v_blocked_count INT;
BEGIN
  SELECT COUNT(*) INTO v_blocked_count
  FROM public.vendors
  WHERE is_ledger_reconciled = FALSE;

  IF v_blocked_count > 0 THEN
    RAISE NOTICE 'ATTENTION: % vendors remain un-reconciled (Population D) and will be payout-blocked. These vendors require manual remediation and backfilling via the shadow ledger.', v_blocked_count;
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- 7. Drop Legacy Overloads and Harden request_payout
-- -----------------------------------------------------------------------------
-- CREATE OR REPLACE only targets exact signature matches. We must manually
-- drop the legacy rupee-denominated NUMERIC signature so that only the 
-- strict integer-paise canonical signature remains executable.
DROP FUNCTION IF EXISTS public.request_payout(UUID, NUMERIC, TEXT, UUID);
-- We also explicitly drop the ancient BIGINT ID signature just in case it 
-- survived in older database branches.
DROP FUNCTION IF EXISTS public.request_payout(BIGINT, TEXT, INT);

CREATE OR REPLACE FUNCTION public.request_payout(
  p_vendor_id       UUID,
  p_amount_paise    BIGINT,
  p_method_id       TEXT    DEFAULT NULL,
  p_idempotency_key UUID    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payout_id  UUID;
  v_status     TEXT;
  v_balance    NUMERIC;
  v_is_ledger_reconciled BOOLEAN;
  v_payout     public.payouts;
  v_err_msg    TEXT;
  v_err_code   TEXT;
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
  INSERT INTO public.payouts (
    vendor_id, amount_paise, amount, method_id, status, idempotency_key
  )
  VALUES (
    p_vendor_id, p_amount_paise, (p_amount_paise::numeric / 100), p_method_id, 'pending', p_idempotency_key
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id, status INTO v_payout_id, v_status;

  IF v_payout_id IS NULL THEN
    SELECT * INTO v_payout
      FROM public.payouts
     WHERE idempotency_key = p_idempotency_key;

    -- Guard against repeatable-read invisible rows
    IF v_payout.id IS NULL THEN
      RAISE EXCEPTION 'Concurrent idempotency race detected: row not visible'
        USING ERRCODE = '40001';
    END IF;

    IF p_vendor_id IS DISTINCT FROM v_payout.vendor_id 
       OR p_amount_paise IS DISTINCT FROM v_payout.amount_paise 
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
  SELECT 
      COALESCE(withdrawable_balance, 0),
      is_ledger_reconciled
    INTO 
      v_balance,
      v_is_ledger_reconciled
    FROM public.vendors
   WHERE id = p_vendor_id
     FOR UPDATE;

  -- NOTE: Any exceptions raised below will trigger a block-level rollback, 
  -- automatically reversing the pending payout INSERT and releasing the idempotency claim.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vendor not found';
  END IF;

  -- ---- 3. Strict Ledger Reconciliation Guard ----
  IF NOT v_is_ledger_reconciled THEN
    RAISE EXCEPTION 'LEDGER_RECONCILIATION_REQUIRED: Vendor % cannot process payouts until financial history is reconciled', p_vendor_id;
  END IF;

  -- ---- 4. Sufficient balance check ----
  IF p_amount_paise > v_balance THEN
    RAISE EXCEPTION 'Insufficient balance: requested % but only % available', p_amount_paise, v_balance;
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
      RAISE EXCEPTION 'Unauthorized payment method';
    END IF;
  END IF;

  -- ---- 6. Stamp debited_at (Legacy API compatibility for UI) ----
  UPDATE public.payouts
     SET debited_at = now()
   WHERE id = v_payout_id
  RETURNING * INTO v_payout;

  -- ---- 7. Insert Canonical Ledger Entry ----
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

EXCEPTION 
  WHEN serialization_failure OR deadlock_detected THEN
    RAISE;
  WHEN OTHERS THEN
  v_err_msg := SQLERRM;
  v_err_code := SQLSTATE;

  IF v_err_code = '23505' THEN
    v_err_msg := 'Duplicate idempotency key';
    v_status_code := 409;
  ELSIF v_err_code = '23503' THEN
    v_err_msg := 'Invalid reference (Foreign Key Violation)';
    v_status_code := 400;
  ELSIF v_err_code = 'P0001' THEN
    IF v_err_msg LIKE '%Idempotency key collision%' OR v_err_msg = 'IDEMPOTENCY_TERMINAL' THEN
      v_status_code := 409;
    ELSE
      v_status_code := 400;
    END IF;
  ELSE
    v_status_code := 500;
  END IF;

  BEGIN
    -- Architecture Note: payment_audit_log.payment_id lacks a foreign key constraint to payouts 
    -- by design. This allows it to act as an operation correlation ID, securely recording the 
    -- UUID of a failed payout attempt even if the physical payout row was rolled back.
    INSERT INTO public.payment_audit_log (payment_id, old_status, new_status, source, metadata)
    VALUES (
      COALESCE(v_payout_id, '00000000-0000-0000-0000-000000000000'::uuid),
      'request_payout',
      'failed',
      'request_payout_rpc',
      jsonb_build_object(
        'sqlstate', v_err_code,
        'sqlerrm', v_err_msg,
        'vendor_id', p_vendor_id,
        'amount_paise', p_amount_paise,
        'method_id', p_method_id,
        'idempotency_key', p_idempotency_key
      )
    );
  EXCEPTION
    WHEN OTHERS THEN
      -- Emit a non-fatal warning so the telemetry failure is observable in Postgres logs, 
      -- while preserving the original business error response for the client.
      -- Only SQLSTATE is logged to guarantee no PII/payment secrets leak into raw logs.
      RAISE WARNING 'Payment audit telemetry failed in request_payout [SQLSTATE: %]', SQLSTATE;
  END;

  RETURN jsonb_build_object(
    'success', false,
    'error', v_err_msg,
    'status', v_status_code,
    'code', v_err_code
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.request_payout(UUID, BIGINT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_payout(UUID, BIGINT, TEXT, UUID) TO service_role;

-- -----------------------------------------------------------------------------
-- 8. Verify request_payout Signatures and Security
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_overload_count INT;
  v_is_canonical_correct BOOLEAN;
BEGIN
  -- Count total overloads
  SELECT COUNT(*) INTO v_overload_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'request_payout';

  IF v_overload_count <> 1 THEN
    RAISE EXCEPTION 'MIGRATION ABORTED: Expected exactly 1 request_payout overload, but found %.', v_overload_count;
  END IF;

  -- ── Role-existence guard ────────────────────────────────────────────────
  -- has_function_privilege() raises an error if the role does not exist.
  -- We must guard each call with an explicit existence check. PL/pgSQL
  -- IF-THEN-ELSIF branches are evaluated sequentially and guarantee the
  -- privilege function is never called for a missing role.
  --
  -- Convention: this migration targets the Supabase-managed platform where
  -- service_role, anon, and authenticated are mandatory. If any role is absent
  -- the migration aborts with a diagnostic exception rather than silently
  -- continuing with weakened ACL guarantees.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    RAISE EXCEPTION 'MIGRATION ABORTED: Required Supabase role service_role is missing. This migration is designed for the Supabase platform.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    RAISE EXCEPTION 'MIGRATION ABORTED: Required Supabase role anon is missing. This migration is designed for the Supabase platform.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    RAISE EXCEPTION 'MIGRATION ABORTED: Required Supabase role authenticated is missing. This migration is designed for the Supabase platform.';
  END IF;

  -- ── Security assertion — all three roles are confirmed to exist ─────────
  -- Each has_function_privilege() call is now guaranteed safe because the
  -- role-existence checks above would have raised before reaching this point.
  SELECT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'request_payout'
      AND pg_get_function_identity_arguments(p.oid) = 'p_vendor_id uuid, p_amount_paise bigint, p_method_id text, p_idempotency_key uuid'
      AND p.prosecdef = true
      AND has_function_privilege('service_role', p.oid, 'EXECUTE') = true
      AND has_function_privilege('anon', p.oid, 'EXECUTE') = false
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE') = false
  ) INTO v_is_canonical_correct;

  IF NOT v_is_canonical_correct THEN
    RAISE EXCEPTION 'MIGRATION ABORTED: The surviving request_payout signature is incorrect, or lacks SECURITY DEFINER, or has insecure execution grants.';
  END IF;
END;
$$;

COMMIT;
