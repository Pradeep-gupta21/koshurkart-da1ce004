BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ('12345678-1234-1234-1234-123456789012', 'test_telemetry@test.com', '{"terms_accepted": true}') ON CONFLICT DO NOTHING;
INSERT INTO public.vendors (id, user_id, store_name, store_slug, business_name, withdrawable_balance, is_ledger_reconciled) 
VALUES ('12345678-1234-1234-1234-123456789012', '12345678-1234-1234-1234-123456789012', 's_tel', 's_tel', 'Test Telemetry Vendor', 500, true)
ON CONFLICT (id) DO UPDATE SET withdrawable_balance=500, is_ledger_reconciled=true;

ALTER TABLE public.payouts DISABLE TRIGGER trg_validate_payout_request;

DO $$ 
DECLARE 
  v_res JSONB;
  v_idem UUID := gen_random_uuid();
  v_count INT;
  v_audit_row public.payment_audit_log%ROWTYPE;
BEGIN
  v_res := public.request_payout('12345678-1234-1234-1234-123456789012'::uuid, 600, NULL, v_idem);
  
  -- Request-specific telemetry lookup
  SELECT COUNT(*) INTO v_count 
  FROM public.payment_audit_log 
  WHERE metadata->>'idempotency_key' = v_idem::text;
    
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: Expected exactly 1 telemetry row for idempotency_key %, got %', v_idem, v_count;
  END IF;

  SELECT * INTO v_audit_row
  FROM public.payment_audit_log 
  WHERE metadata->>'idempotency_key' = v_idem::text;

  IF v_audit_row.new_status <> 'failed' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: Expected new_status to be failed, got %', v_audit_row.new_status;
  END IF;

  IF v_audit_row.source <> 'request_payout_rpc' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: Expected source to be request_payout_rpc, got %', v_audit_row.source;
  END IF;
  
  RAISE NOTICE 'TELEMETRY TEST 1 PASSED: Request-specific telemetry correctly asserted.';
END $$;

ROLLBACK;
