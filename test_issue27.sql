BEGIN;
SET CONSTRAINTS ALL DEFERRED;
-- Insert a test customer and vendor
-- REGRESSION TEST: auth.users.id and vendors.id are explicitly decoupled
-- to ensure vendor identity resolution does not conflate the two.
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('11111111-0000-0000-0000-000000000001', 'test_cust@test.com', '{"terms_accepted": true}'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'test_vend@test.com', '{"terms_accepted": true}')
ON CONFLICT DO NOTHING;


INSERT INTO public.vendors (id, user_id, store_name, store_slug, business_name, withdrawable_balance)
VALUES ('bbbbbbbb-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000002', 'Test Store', 'test_store', 'Test Business', 1000)
ON CONFLICT (id) DO UPDATE SET withdrawable_balance = 1000;

INSERT INTO public.products (id, vendor_id, title, slug, description, price, stock)
VALUES ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000002', 'Test Product', 'test-product', 'Desc', 10.00, 10)
ON CONFLICT DO NOTHING;

ALTER TABLE public.order_items DISABLE TRIGGER trg_prevent_direct_return_status_update;

-- Create an order and payment
INSERT INTO public.orders (id, user_id, payment_status, order_status)
VALUES ('44444444-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001', 'success', 'processing')
ON CONFLICT DO NOTHING;

INSERT INTO public.payments (id, user_id, order_id, amount, payment_status, payment_method)
VALUES ('33333333-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000004', 10.00, 'success', 'card')
ON CONFLICT DO NOTHING;

-- Case 1: Canonical Replay (should succeed and return non-null fields)
INSERT INTO public.order_items (id, order_id, vendor_id, product_id, title, quantity, price, return_status)
VALUES ('55555555-0000-0000-0000-000000000005', '44444444-0000-0000-0000-000000000004', 'bbbbbbbb-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'Test Item 1', 1, 10.00, 'requested')
ON CONFLICT DO NOTHING;
-- insert credit ledger to simulate prior success
INSERT INTO public.ledger_entries (id, operation_key, vendor_id, order_id, order_item_id, type, amount_paise, status)
VALUES ('66666666-0000-0000-0000-000000000006', 'cred1', 'bbbbbbbb-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000004', '55555555-0000-0000-0000-000000000005', 'credit', 900, 'confirmed')
ON CONFLICT DO NOTHING;

DO $$
DECLARE
  v_res JSONB;
BEGIN
  -- first execution
  v_res := public.approve_return_intent('55555555-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000002');
  IF (v_res->>'success')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'Case 1 initial run failed: %', v_res;
  END IF;

  -- replay
  v_res := public.approve_return_intent('55555555-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000002');
  IF (v_res->>'isIdempotentReplay')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'Case 1 replay flag not set: %', v_res;
  END IF;
  IF (v_res->'data'->>'amountPaise') IS NULL OR (v_res->'data'->>'operationKey') IS NULL THEN
    RAISE EXCEPTION 'Case 1 replay missing financial provenance: %', v_res;
  END IF;
  RAISE NOTICE 'Case 1 PASSED';
END $$;

-- Case 2: Reversing Replay with missing required ledger provenance
INSERT INTO public.order_items (id, order_id, vendor_id, product_id, title, quantity, price, return_status)
VALUES ('55555555-0000-0000-0000-000000000007', '44444444-0000-0000-0000-000000000004', 'bbbbbbbb-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'Test Item 2', 1, 10.00, 'reversing')
ON CONFLICT DO NOTHING;

DO $$
DECLARE
  v_res JSONB;
BEGIN
  -- try replay when ledger_entries is missing
  v_res := public.approve_return_intent('55555555-0000-0000-0000-000000000007', 'aaaaaaaa-0000-0000-0000-000000000002');
  IF (v_res->>'success')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'Case 2 failed closed condition. Should have failed, but returned: %', v_res;
  END IF;
  IF (v_res->>'errorCode') IS DISTINCT FROM 'INTERNAL_ERROR' THEN
    RAISE EXCEPTION 'Case 2 incorrect error code: %', v_res;
  END IF;
  RAISE NOTICE 'Case 2 PASSED';
END $$;

-- Case 3: Escalated Replay with missing required escalation/financial provenance
INSERT INTO public.order_items (id, order_id, vendor_id, product_id, title, quantity, price, return_status)
VALUES ('55555555-0000-0000-0000-000000000008', '44444444-0000-0000-0000-000000000004', 'bbbbbbbb-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'Test Item 3', 1, 10.00, 'escalated')
ON CONFLICT DO NOTHING;

DO $$
DECLARE
  v_res JSONB;
BEGIN
  -- try replay when escalation is missing
  v_res := public.approve_return_intent('55555555-0000-0000-0000-000000000008', 'aaaaaaaa-0000-0000-0000-000000000002');
  IF (v_res->>'success')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'Case 3 failed closed condition. Should have failed, but returned: %', v_res;
  END IF;
  IF (v_res->>'errorCode') IS DISTINCT FROM 'INTERNAL_ERROR' THEN
    RAISE EXCEPTION 'Case 3 incorrect error code: %', v_res;
  END IF;
  RAISE NOTICE 'Case 3 PASSED';
END $$;

-- Case 4: Wrong vendor ID (caller without a vendor row)
DO $$
DECLARE
  v_res JSONB;
BEGIN
  -- The UID passed here is NOT in the vendors table. Should fail fast with FORBIDDEN.
  v_res := public.approve_return_intent('55555555-0000-0000-0000-000000000005', '99999999-9999-9999-9999-999999999999');
  IF (v_res->>'success')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'Case 4 failed. Wrong auth uid should be rejected. Result: %', v_res;
  END IF;
  IF (v_res->>'errorCode') IS DISTINCT FROM 'FORBIDDEN' THEN
    RAISE EXCEPTION 'Case 4 incorrect error code. Expected FORBIDDEN, got: %', v_res;
  END IF;
  RAISE NOTICE 'Case 4 PASSED';
END $$;

-- Case 4b: Wrong vendor ID (caller HAS a vendor row but doesn't own this order item)
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('cccccccc-0000-0000-0000-000000000003', 'test_vend3@test.com', '{"terms_accepted": true}')
ON CONFLICT DO NOTHING;

INSERT INTO public.vendors (id, user_id, store_name, store_slug, business_name, withdrawable_balance)
VALUES ('dddddddd-0000-0000-0000-000000000003', 'cccccccc-0000-0000-0000-000000000003', 'Test Store 3', 'test_store_3', 'Test Business 3', 1000)
ON CONFLICT (id) DO UPDATE SET withdrawable_balance = 1000;

DO $$
DECLARE
  v_res JSONB;
BEGIN
  -- The UID passed here resolves to a valid vendor, but that vendor doesn't own item ...0005.
  v_res := public.approve_return_intent('55555555-0000-0000-0000-000000000005', 'cccccccc-0000-0000-0000-000000000003');
  IF (v_res->>'success')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'Case 4b failed. Different vendor should be rejected. Result: %', v_res;
  END IF;
  IF (v_res->>'errorCode') IS DISTINCT FROM 'FORBIDDEN' THEN
    RAISE EXCEPTION 'Case 4b incorrect error code. Expected FORBIDDEN, got: %', v_res;
  END IF;
  RAISE NOTICE 'Case 4b PASSED';
END $$;


-- Case 6: Timestamp Collision Deterministic Payment Resolution
INSERT INTO public.orders (id, user_id, payment_status, order_status)
VALUES ('44444444-0000-0000-0000-000000000006', '11111111-0000-0000-0000-000000000001', 'success', 'processing')
ON CONFLICT DO NOTHING;

INSERT INTO public.order_items (id, order_id, vendor_id, product_id, title, quantity, price, return_status)
VALUES ('55555555-0000-0000-0000-000000000006', '44444444-0000-0000-0000-000000000006', 'bbbbbbbb-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'Test Item 6', 1, 10.00, 'requested')
ON CONFLICT DO NOTHING;

INSERT INTO public.payments (id, user_id, order_id, amount, payment_status, payment_method, created_at)
VALUES ('aaaaaaaa-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000006', 15.00, 'success', 'card', '2026-01-01 10:00:00+00')
ON CONFLICT DO NOTHING;

INSERT INTO public.payments (id, user_id, order_id, amount, payment_status, payment_method, created_at)
VALUES ('bbbbbbbb-0000-0000-0000-00000000000b', '11111111-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000006', 20.00, 'completed', 'card', '2026-01-01 10:00:00+00')
ON CONFLICT DO NOTHING;

-- insert credit ledger to simulate prior success
INSERT INTO public.ledger_entries (id, operation_key, vendor_id, order_id, order_item_id, type, amount_paise, status)
VALUES ('66666666-0000-0000-0000-000000000008', 'cred6', 'bbbbbbbb-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000006', '55555555-0000-0000-0000-000000000006', 'credit', 900, 'confirmed')
ON CONFLICT DO NOTHING;

DO $$
DECLARE
  v_res JSONB;
BEGIN
  v_res := public.approve_return_intent('55555555-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000002');
  IF (v_res->>'success')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'Case 6 failed to execute RPC: %', v_res;
  END IF;
  -- Since 'bbbbbbbb-...' > 'aaaaaaaa-...', the deterministic tie-breaker (id DESC) should select 'bbbbbbbb-...'
  IF (v_res->'data'->>'paymentId') IS DISTINCT FROM 'bbbbbbbb-0000-0000-0000-00000000000b' THEN
    RAISE EXCEPTION 'Case 6 failed deterministic tie-breaker. Expected payment bbbbbbbb..., got: %', v_res;
  END IF;
  RAISE NOTICE 'Case 6 PASSED';
END $$;

-- Case 7: Execution Model Hardening (anon role)
DO $$
BEGIN
  SET ROLE anon;
  PERFORM public.approve_return_intent('55555555-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000002');
  RAISE EXCEPTION 'Case 7 failed. anon role should not be able to execute the RPC.';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Case 7 PASSED';
END $$;
RESET ROLE;

-- Case 8: Execution Model Hardening (authenticated role)
DO $$
BEGIN
  SET ROLE authenticated;
  PERFORM public.approve_return_intent('55555555-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000002');
  RAISE EXCEPTION 'Case 8 failed. authenticated role should not be able to execute the RPC.';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Case 8 PASSED';
END $$;
RESET ROLE;

-- Case 9: Execution Model Hardening (service_role)
DO $$
BEGIN
  SET ROLE service_role;
  -- Expected to fail with logic error (since it's a replay or something else, but NOT insufficient_privilege)
  PERFORM public.approve_return_intent('55555555-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000002');
  RAISE NOTICE 'Case 9 PASSED';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE EXCEPTION 'Case 9 failed. service_role should be able to execute the RPC.';
  WHEN OTHERS THEN
    -- Any other exception (e.g. data conflict or idempotent state mismatch) means execution WAS allowed
    RAISE NOTICE 'Case 9 PASSED (failed inside execution, meaning privileges were granted)';
END $$;
RESET ROLE;

-- Case 10: Idempotent Replay with Refunded Payment Status
-- Simulates the scenario where the initial approval succeeds, the return progresses,
-- and the payment status changes to refunded. A retry of the approval intent
-- should still return the canonical replay response.
INSERT INTO public.orders (id, user_id, payment_status, order_status)
VALUES ('44444444-0000-0000-0000-000000000010', '11111111-0000-0000-0000-000000000001', 'refunded', 'processing')
ON CONFLICT DO NOTHING;

INSERT INTO public.order_items (id, order_id, vendor_id, product_id, title, quantity, price, return_status)
VALUES ('55555555-0000-0000-0000-000000000010', '44444444-0000-0000-0000-000000000010', 'bbbbbbbb-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'Test Item 10', 1, 10.00, 'reversing')
ON CONFLICT DO NOTHING;

INSERT INTO public.payments (id, user_id, order_id, amount, payment_status, payment_method, created_at)
VALUES ('cccccccc-0000-0000-0000-00000000000c', '11111111-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000010', 10.00, 'refunded', 'card', '2026-01-01 10:00:00+00')
ON CONFLICT DO NOTHING;

-- insert credit ledger to simulate prior success
INSERT INTO public.ledger_entries (id, operation_key, vendor_id, order_id, order_item_id, type, amount_paise, status)
VALUES ('66666666-0000-0000-0000-000000000010', 'cred10', 'bbbbbbbb-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000010', '55555555-0000-0000-0000-000000000010', 'credit', 900, 'confirmed')
ON CONFLICT DO NOTHING;

-- insert reversal ledger for replay hydration
INSERT INTO public.ledger_entries (id, operation_key, vendor_id, order_id, order_item_id, type, amount_paise, status)
VALUES ('77777777-0000-0000-0000-000000000010', 'rev10', 'bbbbbbbb-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000010', '55555555-0000-0000-0000-000000000010', 'reversal', 900, 'pending')
ON CONFLICT DO NOTHING;

DO $$
DECLARE
  v_res JSONB;
BEGIN
  -- replay
  v_res := public.approve_return_intent('55555555-0000-0000-0000-000000000010', 'aaaaaaaa-0000-0000-0000-000000000002');
  IF (v_res->>'isIdempotentReplay')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'Case 10 replay flag not set: %', v_res;
  END IF;
  IF (v_res->'data'->>'amountPaise') IS NULL OR (v_res->'data'->>'operationKey') IS NULL THEN
    RAISE EXCEPTION 'Case 10 replay missing financial provenance: %', v_res;
  END IF;
  RAISE NOTICE 'Case 10 PASSED';
END $$;

ROLLBACK;
