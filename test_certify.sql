BEGIN;

-- ====================================================================
-- test_certify.sql — Deterministic Regression Test for the Frozen
-- Population C Certification Predicate
--
-- PURPOSE:
--   This file independently verifies the frozen Population-C certification
--   predicate by running it against a fully scoped, deterministic fixture set
--   and asserting pass/fail outcomes with RAISE EXCEPTION.
--
-- RELATIONSHIP TO test_population_c.sql:
--   test_population_c.sql is the primary end-to-end fixture suite that also
--   exercises Population B materialization and the full classification matrix.
--   This file exists as a narrowly scoped regression guard that proves the
--   frozen certification predicate text itself is correct in isolation, without
--   depending on the Population B pipeline having run.
--
-- FROZEN PREDICATE — DO NOT DRY:
--   The certification UPDATE below is a deliberate copy of the predicate in
--   20260729171200_canonicalize_vendor_balance_provenance.sql (Population C).
--   It MUST NOT be extracted into a shared function or view. The migration
--   predicate must remain frozen to the exact rules used at cutover time.
--
--   If the predicate is intentionally changed before migration is finalized,
--   update this file and rerun the full certification test matrix.
--
-- SAFETY:
--   All mutations are scoped to deterministic fixture UUIDs.
--   The outer ROLLBACK ensures zero permanent state survives.
-- ====================================================================

-- Setup: auth users required for FK
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('c1111111-0000-0000-0000-000000000001', 'cert1@test.com', '{"terms_accepted": true}'),
  ('c1111111-0000-0000-0000-000000000002', 'cert2@test.com', '{"terms_accepted": true}'),
  ('c1111111-0000-0000-0000-000000000003', 'cert3@test.com', '{"terms_accepted": true}'),
  ('c1111111-0000-0000-0000-000000000004', 'cert4@test.com', '{"terms_accepted": true}')
ON CONFLICT DO NOTHING;

-- Fixture: 4 vendors with all is_ledger_reconciled = FALSE
INSERT INTO public.vendors (id, user_id, store_name, store_slug, business_name, total_earnings, withdrawable_balance, is_ledger_reconciled)
VALUES
  -- CERT1: Should PASS — credit ledger matches total_earnings exactly
  ('c1111111-0000-0000-0000-000000000001', 'c1111111-0000-0000-0000-000000000001', 'cert_s1', 'cert_s1', 'CERT1 - Must Certify', 10.00, 1000, false),
  -- CERT2: Should FAIL — credit ledger does NOT match total_earnings (diverges)
  ('c1111111-0000-0000-0000-000000000002', 'c1111111-0000-0000-0000-000000000002', 'cert_s2', 'cert_s2', 'CERT2 - Witness1 Mismatch', 10.00, 1000, false),
  -- CERT3: Should FAIL — unknown ledger type blocks GUARD 1
  ('c1111111-0000-0000-0000-000000000003', 'c1111111-0000-0000-0000-000000000003', 'cert_s3', 'cert_s3', 'CERT3 - Unknown Type', 10.00, 1000, false),
  -- CERT4: Should FAIL — withdrawable_balance does not match ledger projection (WITNESS 3)
  ('c1111111-0000-0000-0000-000000000004', 'c1111111-0000-0000-0000-000000000004', 'cert_s4', 'cert_s4', 'CERT4 - Balance Mismatch', 10.00, 999, false)
ON CONFLICT (id) DO UPDATE SET
  total_earnings = EXCLUDED.total_earnings,
  withdrawable_balance = EXCLUDED.withdrawable_balance,
  is_ledger_reconciled = false;

-- Disable trigger so we can manually insert historically-inconsistent fixtures
ALTER TABLE public.ledger_entries DISABLE TRIGGER trg_recalculate_withdrawable_balance;
ALTER TABLE public.payouts DISABLE TRIGGER trg_validate_payout_request;

-- Clean prior runs of these fixture IDs
DELETE FROM public.ledger_entries WHERE vendor_id IN (
  'c1111111-0000-0000-0000-000000000001',
  'c1111111-0000-0000-0000-000000000002',
  'c1111111-0000-0000-0000-000000000003',
  'c1111111-0000-0000-0000-000000000004'
);
DELETE FROM public.payouts WHERE vendor_id IN (
  'c1111111-0000-0000-0000-000000000001',
  'c1111111-0000-0000-0000-000000000002',
  'c1111111-0000-0000-0000-000000000003',
  'c1111111-0000-0000-0000-000000000004'
);

-- CERT1: 10 rupees total_earnings => 1000 paise credit (balance = 1000)
INSERT INTO public.ledger_entries (id, operation_key, vendor_id, type, amount_paise, status)
VALUES ('c1111111-1000-0000-0000-000000000001', 'cert1:credit:1', 'c1111111-0000-0000-0000-000000000001', 'credit', 1000, 'confirmed');

-- CERT2: Only 500 paise credit, but total_earnings = 10.00 => 1000 paise expected (WITNESS 1 mismatch)
INSERT INTO public.ledger_entries (id, operation_key, vendor_id, type, amount_paise, status)
VALUES ('c1111111-1000-0000-0000-000000000002', 'cert2:credit:1', 'c1111111-0000-0000-0000-000000000002', 'credit', 500, 'confirmed');

-- CERT3: 1000 paise credit but also has unknown type 'refund' (GUARD 1 blocks)
INSERT INTO public.ledger_entries (id, operation_key, vendor_id, type, amount_paise, status)
VALUES
  ('c1111111-1000-0000-0000-000000000003', 'cert3:credit:1', 'c1111111-0000-0000-0000-000000000003', 'credit', 1000, 'confirmed'),
  ('c1111111-2000-0000-0000-000000000003', 'cert3:refund:1', 'c1111111-0000-0000-0000-000000000003', 'refund', 100, 'confirmed');

-- CERT4: 1000 paise credit, balance set to 999 (WITNESS 3 mismatch)
INSERT INTO public.ledger_entries (id, operation_key, vendor_id, type, amount_paise, status)
VALUES ('c1111111-1000-0000-0000-000000000004', 'cert4:credit:1', 'c1111111-0000-0000-0000-000000000004', 'credit', 1000, 'confirmed');

-- Re-enable triggers
ALTER TABLE public.ledger_entries ENABLE TRIGGER trg_recalculate_withdrawable_balance;
ALTER TABLE public.payouts ENABLE TRIGGER trg_validate_payout_request;

-- ====================================================================
-- FROZEN CERTIFICATION PREDICATE (copy of Pop C block in migration)
-- ====================================================================
UPDATE public.vendors v
SET is_ledger_reconciled = TRUE
WHERE
  v.id IN (
    'c1111111-0000-0000-0000-000000000001',
    'c1111111-0000-0000-0000-000000000002',
    'c1111111-0000-0000-0000-000000000003',
    'c1111111-0000-0000-0000-000000000004'
  )
  AND
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

-- ====================================================================
-- ASSERTIONS
-- ====================================================================
DO $$
DECLARE
  v_cert1_reconciled BOOLEAN;
  v_cert2_reconciled BOOLEAN;
  v_cert3_reconciled BOOLEAN;
  v_cert4_reconciled BOOLEAN;
BEGIN
  SELECT is_ledger_reconciled INTO v_cert1_reconciled FROM public.vendors WHERE id = 'c1111111-0000-0000-0000-000000000001';
  SELECT is_ledger_reconciled INTO v_cert2_reconciled FROM public.vendors WHERE id = 'c1111111-0000-0000-0000-000000000002';
  SELECT is_ledger_reconciled INTO v_cert3_reconciled FROM public.vendors WHERE id = 'c1111111-0000-0000-0000-000000000003';
  SELECT is_ledger_reconciled INTO v_cert4_reconciled FROM public.vendors WHERE id = 'c1111111-0000-0000-0000-000000000004';

  IF v_cert1_reconciled IS NOT TRUE THEN
    RAISE EXCEPTION 'ASSERTION FAILED: CERT1 (valid ledger) must be certified TRUE. Got: %', v_cert1_reconciled;
  END IF;

  IF v_cert2_reconciled IS NOT FALSE THEN
    RAISE EXCEPTION 'ASSERTION FAILED: CERT2 (WITNESS 1 mismatch) must remain FALSE. Got: %', v_cert2_reconciled;
  END IF;

  IF v_cert3_reconciled IS NOT FALSE THEN
    RAISE EXCEPTION 'ASSERTION FAILED: CERT3 (unknown type) must remain FALSE (GUARD 1 blocks). Got: %', v_cert3_reconciled;
  END IF;

  IF v_cert4_reconciled IS NOT FALSE THEN
    RAISE EXCEPTION 'ASSERTION FAILED: CERT4 (balance mismatch) must remain FALSE (WITNESS 3 blocks). Got: %', v_cert4_reconciled;
  END IF;

  RAISE NOTICE 'ALL test_certify.sql ASSERTIONS PASSED.';
END $$;

ROLLBACK;
