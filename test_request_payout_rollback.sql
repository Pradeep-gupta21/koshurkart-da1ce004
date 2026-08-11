BEGIN;

-- Setup test vendor and method
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ('12345678-1234-1234-1234-123456789012', 'test_rollback@test.com', '{"terms_accepted": true}') ON CONFLICT DO NOTHING;
INSERT INTO public.vendors (id, user_id, store_name, store_slug, business_name, withdrawable_balance, is_ledger_reconciled) 
VALUES 
  ('12345678-1234-1234-1234-123456789012', '12345678-1234-1234-1234-123456789012', 'store_rollback', 'store_rollback', 'Test Vendor Rollback', 500, true)
ON CONFLICT (id) DO UPDATE SET withdrawable_balance=500, is_ledger_reconciled=true;

ALTER TABLE public.payouts DISABLE TRIGGER trg_validate_payout_request;

DO $$ 
DECLARE
  v_res JSONB;
  v_idem UUID := gen_random_uuid();
  v_pre_payout_count INT;
  v_pre_ledger_count INT;
  v_pre_balance NUMERIC;
  v_post_payout_count INT;
  v_post_ledger_count INT;
  v_post_balance NUMERIC;
BEGIN
  -- Capture BEFORE execution
  SELECT COUNT(*) INTO v_pre_payout_count FROM public.payouts WHERE vendor_id = '12345678-1234-1234-1234-123456789012';
  SELECT COUNT(*) INTO v_pre_ledger_count FROM public.ledger_entries WHERE vendor_id = '12345678-1234-1234-1234-123456789012';
  SELECT COALESCE(withdrawable_balance, 0) INTO v_pre_balance FROM public.vendors WHERE id = '12345678-1234-1234-1234-123456789012';

  -- Test: insufficient balance (requesting 600 paise, balance is 500)
  v_res := public.request_payout(
    '12345678-1234-1234-1234-123456789012'::uuid, 
    600, 
    NULL, 
    v_idem
  );

  -- Assert JSON response contract
  IF (v_res->>'success')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'ASSERTION FAILED: Expected success=false, got %', v_res->>'success';
  END IF;

  IF (v_res->>'status')::int <> 400 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: Expected status=400, got %', v_res->>'status';
  END IF;

  IF (v_res->>'code') <> 'P0001' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: Expected code=P0001, got %', v_res->>'code';
  END IF;

  IF v_res->>'error' NOT LIKE 'Insufficient balance:%' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: Expected error to be Insufficient balance, got %', v_res->>'error';
  END IF;

  -- Capture AFTER execution
  SELECT COUNT(*) INTO v_post_payout_count FROM public.payouts WHERE vendor_id = '12345678-1234-1234-1234-123456789012';
  SELECT COUNT(*) INTO v_post_ledger_count FROM public.ledger_entries WHERE vendor_id = '12345678-1234-1234-1234-123456789012';
  SELECT COALESCE(withdrawable_balance, 0) INTO v_post_balance FROM public.vendors WHERE id = '12345678-1234-1234-1234-123456789012';

  -- Assert PRE == POST
  IF v_post_payout_count <> v_pre_payout_count THEN
    RAISE EXCEPTION 'ASSERTION FAILED: Expected % payout rows, got %', v_pre_payout_count, v_post_payout_count;
  END IF;

  IF v_post_ledger_count <> v_pre_ledger_count THEN
    RAISE EXCEPTION 'ASSERTION FAILED: Expected % ledger entries, got %', v_pre_ledger_count, v_post_ledger_count;
  END IF;

  IF v_post_balance <> v_pre_balance THEN
    RAISE EXCEPTION 'ASSERTION FAILED: Expected balance %, got %', v_pre_balance, v_post_balance;
  END IF;

  RAISE NOTICE 'TEST PASSED: Insufficient balance branch and rollback PRE == POST invariants successfully validated.';
END $$;

ROLLBACK;
