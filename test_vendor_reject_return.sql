BEGIN;
SET CONSTRAINTS ALL DEFERRED;

-- =============================================================================
-- Test: vendor_reject_return — canonical auth.users.id → vendors.id resolution
--
-- Fixture design:
--   auth.users.id values are in the AA…-auth namespace.
--   vendors.id values are in the BB…-vend namespace.
--   order_items.vendor_id references vendors.id (BB…), NOT auth.users.id (AA…).
--
-- This ensures every test exercises the RPC's internal resolution path
-- instead of accidentally succeeding because the two UUID namespaces coincided.
-- =============================================================================

-- Auth users
-- AA-auth-0001  → customer; has no vendors row
-- AA-auth-0002  → correct vendor (auth UID)
-- AA-auth-0003  → wrong vendor (auth UID)
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-000000000001', 'test_cust@test.com',  '{"terms_accepted": true}'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-000000000002', 'test_vend@test.com',  '{"terms_accepted": true}'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-000000000003', 'wrong_vend@test.com', '{"terms_accepted": true}')
ON CONFLICT DO NOTHING;

-- Vendors — id is gen_random_uuid()-style, intentionally != user_id
INSERT INTO public.vendors (id, user_id, store_name, store_slug, business_name, withdrawable_balance)
VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000002', 'Test Store',  'test_store',  'Test Business',  1000),
  ('bbbbbbbb-bbbb-bbbb-bbbb-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000003', 'Wrong Store', 'wrong_store', 'Wrong Business', 0)
ON CONFLICT (id) DO NOTHING;

-- Product owned by vendor BB-vend-0002
INSERT INTO public.products (id, vendor_id, title, slug, description, price, stock)
VALUES ('cccccccc-cccc-cccc-cccc-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-000000000002', 'Test Product', 'test-product', 'Desc', 10.00, 10)
ON CONFLICT DO NOTHING;

-- Order placed by customer AA-auth-0001
ALTER TABLE public.order_items DISABLE TRIGGER trg_prevent_direct_return_status_update;

INSERT INTO public.orders (id, user_id, order_status, total_amount, payment_status, shipping_address)
VALUES ('dddddddd-dddd-dddd-dddd-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000001', 'delivered', 40.00, 'paid',
        '{"line1": "123 Test St", "city": "Test", "state": "TS", "pincode": "123456"}')
ON CONFLICT DO NOTHING;

-- Order items — vendor_id = vendors.id (BB…), NOT auth.users.id (AA…)
INSERT INTO public.order_items (id, order_id, product_id, vendor_id, title, price, quantity, return_status)
VALUES
  ('eeeeeeee-eeee-eeee-eeee-000000000001', 'dddddddd-dddd-dddd-dddd-000000000001', 'cccccccc-cccc-cccc-cccc-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-000000000002', 'Item 1 (requested)',  10.00, 1, 'requested'),
  ('eeeeeeee-eeee-eeee-eeee-000000000002', 'dddddddd-dddd-dddd-dddd-000000000001', 'cccccccc-cccc-cccc-cccc-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-000000000002', 'Item 2 (rejected)',   10.00, 1, 'rejected'),
  ('eeeeeeee-eeee-eeee-eeee-000000000003', 'dddddddd-dddd-dddd-dddd-000000000001', 'cccccccc-cccc-cccc-cccc-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-000000000002', 'Item 3 (approved)',   10.00, 1, 'approved'),
  ('eeeeeeee-eeee-eeee-eeee-000000000004', 'dddddddd-dddd-dddd-dddd-000000000001', 'cccccccc-cccc-cccc-cccc-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-000000000002', 'Item 4 (none)',       10.00, 1, 'none')
ON CONFLICT DO NOTHING;

ALTER TABLE public.order_items ENABLE TRIGGER trg_prevent_direct_return_status_update;

DO $$
DECLARE
  v_res JSONB;
BEGIN
  -- -------------------------------------------------------------------------
  -- Test 1: Wrong vendor
  --   Caller is wrong_vend (AA-auth-0003) → resolves to BB-vend-0003.
  --   order_item belongs to BB-vend-0002 → FORBIDDEN.
  --   This test exercises the full resolution path: auth UID → vendor row →
  --   ownership comparison, using distinct UUIDs throughout.
  -- -------------------------------------------------------------------------
  v_res := public.vendor_reject_return(
    'eeeeeeee-eeee-eeee-eeee-000000000001',
    'aaaaaaaa-aaaa-aaaa-aaaa-000000000003'   -- wrong vendor's auth UID
  );
  ASSERT v_res->>'errorCode' = 'FORBIDDEN',
    format('Test 1 FAILED: expected FORBIDDEN, got %s', v_res->>'errorCode');
  ASSERT (v_res->>'success')::boolean = false,
    'Test 1 FAILED: expected success=false';

  -- -------------------------------------------------------------------------
  -- Test 2: Non-vendor caller (customer has no vendors row)
  --   Caller is customer (AA-auth-0001) who has no vendors row.
  --   Resolution fails → FORBIDDEN (not authenticated as a vendor at all).
  -- -------------------------------------------------------------------------
  v_res := public.vendor_reject_return(
    'eeeeeeee-eeee-eeee-eeee-000000000001',
    'aaaaaaaa-aaaa-aaaa-aaaa-000000000001'   -- customer's auth UID
  );
  ASSERT v_res->>'errorCode' = 'FORBIDDEN',
    format('Test 2 FAILED: expected FORBIDDEN for non-vendor caller, got %s', v_res->>'errorCode');
  ASSERT (v_res->>'success')::boolean = false,
    'Test 2 FAILED: expected success=false';

  -- -------------------------------------------------------------------------
  -- Test 3: Invalid state — approved
  -- -------------------------------------------------------------------------
  v_res := public.vendor_reject_return(
    'eeeeeeee-eeee-eeee-eeee-000000000003',
    'aaaaaaaa-aaaa-aaaa-aaaa-000000000002'   -- correct vendor's auth UID
  );
  ASSERT v_res->>'errorCode' = 'RETURN_NOT_PENDING',
    format('Test 3 FAILED: expected RETURN_NOT_PENDING, got %s', v_res->>'errorCode');
  ASSERT (v_res->>'success')::boolean = false,
    'Test 3 FAILED: expected success=false';

  -- -------------------------------------------------------------------------
  -- Test 4: Invalid state — none
  -- -------------------------------------------------------------------------
  v_res := public.vendor_reject_return(
    'eeeeeeee-eeee-eeee-eeee-000000000004',
    'aaaaaaaa-aaaa-aaaa-aaaa-000000000002'   -- correct vendor's auth UID
  );
  ASSERT v_res->>'errorCode' = 'RETURN_NOT_PENDING',
    format('Test 4 FAILED: expected RETURN_NOT_PENDING for none status, got %s', v_res->>'errorCode');
  ASSERT (v_res->>'success')::boolean = false,
    'Test 4 FAILED: expected success=false';

  -- -------------------------------------------------------------------------
  -- Test 5: Idempotent replay — already rejected
  -- -------------------------------------------------------------------------
  v_res := public.vendor_reject_return(
    'eeeeeeee-eeee-eeee-eeee-000000000002',
    'aaaaaaaa-aaaa-aaaa-aaaa-000000000002'   -- correct vendor's auth UID
  );
  ASSERT (v_res->>'success')::boolean = true,
    format('Test 5 FAILED: expected success=true for replay, got %s', v_res->>'success');
  ASSERT (v_res->>'isIdempotentReplay')::boolean = true,
    'Test 5 FAILED: expected isIdempotentReplay=true';
  ASSERT v_res->>'errorCode' IS NULL,
    format('Test 5 FAILED: expected errorCode=null, got %s', v_res->>'errorCode');

  -- -------------------------------------------------------------------------
  -- Test 6: Happy path — requested → rejected
  -- -------------------------------------------------------------------------
  v_res := public.vendor_reject_return(
    'eeeeeeee-eeee-eeee-eeee-000000000001',
    'aaaaaaaa-aaaa-aaaa-aaaa-000000000002'   -- correct vendor's auth UID
  );
  ASSERT (v_res->>'success')::boolean = true,
    format('Test 6 FAILED: expected success=true, got %s', v_res->>'success');
  ASSERT (v_res->>'isIdempotentReplay')::boolean = false,
    'Test 6 FAILED: expected isIdempotentReplay=false';
  ASSERT v_res->'data'->>'returnStatus' = 'rejected',
    format('Test 6 FAILED: expected returnStatus=rejected, got %s', v_res->'data'->>'returnStatus');

  -- Verify the row was actually mutated
  ASSERT (SELECT return_status FROM public.order_items WHERE id = 'eeeeeeee-eeee-eeee-eeee-000000000001') = 'rejected',
    'Test 6 FAILED: row was not mutated';

  RAISE NOTICE 'All tests passed successfully!';
END;
$$;

ROLLBACK;
