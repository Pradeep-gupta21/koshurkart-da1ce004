BEGIN;

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
  )
RETURNING id, business_name;

SELECT id, business_name, is_ledger_reconciled FROM public.vendors ORDER BY business_name;

ROLLBACK;
