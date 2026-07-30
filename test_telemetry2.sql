BEGIN;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ('12345678-1234-1234-1234-123456789013', 'test_telemetry2@test.com', '{"terms_accepted": true}') ON CONFLICT DO NOTHING;
INSERT INTO public.vendors (id, user_id, store_name, store_slug, business_name, withdrawable_balance, is_ledger_reconciled) 
VALUES ('12345678-1234-1234-1234-123456789013', '12345678-1234-1234-1234-123456789013', 's_tel2', 's_tel2', 'Test Telemetry Vendor 2', 500, true)
ON CONFLICT (id) DO UPDATE SET withdrawable_balance=500, is_ledger_reconciled=true;

ALTER TABLE public.payouts DISABLE TRIGGER trg_validate_payout_request;

DO $$ 
DECLARE 
  v_res JSONB;
  v_idem UUID := gen_random_uuid();
  v_payout_count INT;
  v_ledger_count INT;
  v_audit_count INT;
  v_audit_row public.payment_audit_log%ROWTYPE;
BEGIN
  -- Test: zero amount request
  v_res := public.request_payout('12345678-1234-1234-1234-123456789013'::uuid, 0, NULL, v_idem);
  
  -- 1. Assert JSON response contract
  IF (v_res->>'success')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'ASSERTION FAILED: Expected success=false, got %', v_res->>'success';
  END IF;

  IF (v_res->>'status')::int <> 400 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: Expected status=400, got %', v_res->>'status';
  END IF;

  IF (v_res->>'code') <> 'P0001' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: Expected code=P0001, got %', v_res->>'code';
  END IF;

  IF v_res->>'error' <> 'Requested amount must be greater than 0' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: Expected error to be Requested amount must be greater than 0, got %', v_res->>'error';
  END IF;

  -- 2. Assert NO payout rows survived
  SELECT COUNT(*) INTO v_payout_count FROM public.payouts WHERE idempotency_key = v_idem;
  IF v_payout_count <> 0 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: Expected 0 payout rows, got %', v_payout_count;
  END IF;

  -- 3. Assert NO ledger entries survived
  SELECT COUNT(*) INTO v_ledger_count FROM public.ledger_entries WHERE operation_key = 'payout:' || v_idem::text;
  IF v_ledger_count <> 0 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: Expected 0 ledger entries, got %', v_ledger_count;
  END IF;

  -- 4. Request-specific telemetry lookup
  SELECT COUNT(*) INTO v_audit_count 
  FROM public.payment_audit_log 
  WHERE metadata->>'idempotency_key' = v_idem::text;
    
  IF v_audit_count <> 1 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: Expected exactly 1 telemetry row for zero amount failure, got %', v_audit_count;
  END IF;

  SELECT * INTO v_audit_row
  FROM public.payment_audit_log 
  WHERE metadata->>'idempotency_key' = v_idem::text;

  IF v_audit_row.new_status <> 'failed' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: Expected telemetry new_status failed, got %', v_audit_row.new_status;
  END IF;
  
  RAISE NOTICE 'TEST PASSED: Zero-amount rejection, rollback, and request-specific telemetry successfully validated.';
END $$;

ROLLBACK;
