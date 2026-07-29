-- =============================================================================
-- Verification Script: test_balance_race.sql
-- Goal: Prove that the withdrawable_balance trigger correctly serializes
-- concurrent transactions using FOR UPDATE, preventing projection drift.
-- =============================================================================

-- =============================================================================
-- SETUP (Run in Session 1)
-- =============================================================================
-- 1. Create a test vendor
INSERT INTO public.vendors (id, store_name, withdrawable_balance) 
VALUES ('00000000-0000-0000-0000-000000000001', 'Concurrency Test Store', 0)
ON CONFLICT (id) DO UPDATE SET withdrawable_balance = 0;

-- 2. Clear old test entries
DELETE FROM public.ledger_entries WHERE vendor_id = '00000000-0000-0000-0000-000000000001';
UPDATE public.vendors SET withdrawable_balance = 0 WHERE id = '00000000-0000-0000-0000-000000000001';

-- =============================================================================
-- THE RACE (Follow these steps exactly in two separate psql terminals)
-- =============================================================================

/* --- SESSION 1 --- */
BEGIN;

-- Insert Credit 1 (100.00 Rs)
INSERT INTO public.ledger_entries (vendor_id, type, status, amount_paise, operation_key)
VALUES ('00000000-0000-0000-0000-000000000001', 'credit', 'confirmed', 10000, 'op-credit-1');

-- Session 1 now holds the FOR UPDATE lock on the vendor row.
-- DO NOT COMMIT YET. LEAVE TERMINAL OPEN.


/* --- SESSION 2 --- */
BEGIN;

-- Insert Credit 2 (50.00 Rs)
INSERT INTO public.ledger_entries (vendor_id, type, status, amount_paise, operation_key)
VALUES ('00000000-0000-0000-0000-000000000001', 'credit', 'confirmed', 5000, 'op-credit-2');

-- OBSERVATION: Session 2 WILL HANG HERE. 
-- It is blocked by Session 1's FOR UPDATE lock inside the trigger.


/* --- SESSION 1 --- */
COMMIT;
-- Session 1 completes. The lock is released.


/* --- SESSION 2 --- */
-- You will see Session 2 instantly unblock and finish the INSERT!
COMMIT;


-- =============================================================================
-- VERIFICATION (Run in either session)
-- =============================================================================
DO $$
DECLARE
  v_canonical_sum NUMERIC;
  v_projection NUMERIC;
  v_vendor_id UUID := '00000000-0000-0000-0000-000000000001';
BEGIN
  -- Insert additional test cases to cover the full production invariant
  
  -- Pending payout (negative contribution)
  INSERT INTO public.ledger_entries (vendor_id, type, status, amount_paise, operation_key)
  VALUES (v_vendor_id, 'payout', 'pending', 1000, 'op-payout-pending');
  
  -- Confirmed payout (negative contribution)
  INSERT INTO public.ledger_entries (vendor_id, type, status, amount_paise, operation_key)
  VALUES (v_vendor_id, 'payout', 'confirmed', 2000, 'op-payout-confirmed');

  -- Failed payout (ignored / 0 contribution)
  INSERT INTO public.ledger_entries (vendor_id, type, status, amount_paise, operation_key)
  VALUES (v_vendor_id, 'payout', 'failed', 3000, 'op-payout-failed');

  -- Confirmed Reversal (negative contribution)
  INSERT INTO public.ledger_entries (vendor_id, type, status, amount_paise, operation_key)
  VALUES (v_vendor_id, 'reversal', 'confirmed', 500, 'op-reversal-confirmed');

  -- Ignored combination: Pending credit (should not exist in real life, but ignored by formula)
  INSERT INTO public.ledger_entries (vendor_id, type, status, amount_paise, operation_key)
  VALUES (v_vendor_id, 'credit', 'pending', 4000, 'op-credit-pending');

  -- 1. Calculate canonical sum using the EXACT production formula
  SELECT COALESCE(SUM(
    CASE
      WHEN type IN ('credit', 'refund') AND status = 'confirmed' THEN amount_paise
      WHEN type IN ('debit', 'reservation', 'payout', 'reversal') AND status IN ('pending', 'confirmed') THEN -amount_paise
      ELSE 0
    END
  ), 0) INTO v_canonical_sum
  FROM public.ledger_entries 
  WHERE vendor_id = v_vendor_id;

  -- 2. Retrieve projection (preserve EXACT NUMERIC type)
  SELECT withdrawable_balance INTO v_projection 
  FROM public.vendors 
  WHERE id = v_vendor_id;

  -- 3. Assert equality
  IF v_canonical_sum = v_projection THEN
    RAISE NOTICE 'SUCCESS: Canonical Sum (%) strictly matches Projection (%). No drift!', v_canonical_sum, v_projection;
  ELSE
    RAISE EXCEPTION 'FAILURE: Canonical Sum (%) DOES NOT MATCH Projection (%). Drift or precision loss detected!', v_canonical_sum, v_projection;
  END IF;
END;
$$;
