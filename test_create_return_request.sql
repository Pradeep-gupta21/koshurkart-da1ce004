BEGIN;
SET CONSTRAINTS ALL DEFERRED;

-- 1. Setup Test Data
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('11111111-0000-0000-0000-000000000001', 'test_cust@test.com', '{"terms_accepted": true}'),
  ('33333333-0000-0000-0000-000000000003', 'wrong_cust@test.com', '{"terms_accepted": true}'),
  ('22222222-0000-0000-0000-000000000002', 'test_vend@test.com', '{"terms_accepted": true}')
ON CONFLICT DO NOTHING;

INSERT INTO public.vendors (id, user_id, store_name, store_slug, business_name, withdrawable_balance)
VALUES 
  ('22222222-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000002', 'Test Store', 'test_store', 'Test Business', 1000)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.products (id, vendor_id, title, slug, description, price, stock)
VALUES ('00000000-0000-0000-0000-000000000000', '22222222-0000-0000-0000-000000000002', 'Test Product', 'test-product', 'Desc', 10.00, 10)
ON CONFLICT DO NOTHING;

ALTER TABLE public.order_items DISABLE TRIGGER trg_prevent_direct_return_status_update;

INSERT INTO public.orders (id, user_id, status, total_amount, payment_status, shipping_address)
VALUES ('55555555-0000-0000-0000-000000000000', '11111111-0000-0000-0000-000000000001', 'delivered', 10.00, 'paid', '{"line1": "123 Test St", "city": "Test", "state": "TS", "pincode": "123456"}')
ON CONFLICT DO NOTHING;

INSERT INTO public.order_items (id, order_id, product_id, vendor_id, title, price, quantity, return_status)
VALUES 
  ('77777777-0000-0000-0000-000000000001', '55555555-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', '22222222-0000-0000-0000-000000000002', 'Test Item 1', 10.00, 1, 'none'),
  ('77777777-0000-0000-0000-000000000002', '55555555-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', '22222222-0000-0000-0000-000000000002', 'Test Item 2', 10.00, 1, 'requested'),
  ('77777777-0000-0000-0000-000000000003', '55555555-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', '22222222-0000-0000-0000-000000000002', 'Test Item 3', 10.00, 1, 'rejected')
ON CONFLICT DO NOTHING;

ALTER TABLE public.order_items ENABLE TRIGGER trg_prevent_direct_return_status_update;

DO $$
DECLARE
  v_res JSONB;
  v_photos TEXT[] := ARRAY['photo1.jpg', 'photo2.jpg'];
BEGIN
  -- Test 0: NOT_FOUND
  v_res := public.create_return_request('99999999-0000-0000-0000-000000000009', '11111111-0000-0000-0000-000000000001', 'Defective', 'Broken', v_photos);
  ASSERT v_res->>'errorCode' = 'NOT_FOUND', 'Test 0 Failed: Expected NOT_FOUND';
  ASSERT (v_res->>'success')::boolean = false, 'Test 0 Failed: Expected success=false';

  -- Test 1: Wrong Customer
  v_res := public.create_return_request('77777777-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000003', 'Defective', 'Broken on arrival', v_photos);
  ASSERT v_res->>'errorCode' = 'FORBIDDEN', 'Test 1 Failed: Expected FORBIDDEN';
  ASSERT (v_res->>'success')::boolean = false, 'Test 1 Failed: Expected success=false';

  -- Test 2: Invalid State (rejected)
  v_res := public.create_return_request('77777777-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000001', 'Defective', 'Broken on arrival', v_photos);
  ASSERT v_res->>'errorCode' = 'RETURN_ALREADY_PROCESSED', 'Test 2 Failed: Expected RETURN_ALREADY_PROCESSED';
  ASSERT (v_res->>'success')::boolean = false, 'Test 2 Failed: Expected success=false';

  -- Test 3: Replay (already requested) and verify no overwrite
  -- 77777777-0000-0000-0000-000000000002 has return_status='requested'
  -- Update it manually to have known values first
  UPDATE public.order_items SET return_reason='Original', return_description='Orig desc', return_photos=ARRAY['orig.jpg'], return_requested_at='2020-01-01'::timestamptz WHERE id='77777777-0000-0000-0000-000000000002';
  
  v_res := public.create_return_request('77777777-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', 'New Reason', 'New Desc', v_photos);
  ASSERT (v_res->>'success')::boolean = true, 'Test 3 Failed: Expected success=true for replay';
  ASSERT (v_res->>'isIdempotentReplay')::boolean = true, 'Test 3 Failed: Expected isIdempotentReplay=true';
  ASSERT v_res->>'errorCode' IS NULL, 'Test 3 Failed: Expected errorCode to be null';
  ASSERT v_res->'data'->>'returnRequestedAt' = '2020-01-01T00:00:00+00:00', 'Test 3 Failed: Should return original timestamp in replay';
  
  -- Verify true no-op
  ASSERT (SELECT return_reason FROM public.order_items WHERE id = '77777777-0000-0000-0000-000000000002') = 'Original', 'Test 3 Failed: Reason was overwritten';
  ASSERT (SELECT return_description FROM public.order_items WHERE id = '77777777-0000-0000-0000-000000000002') = 'Orig desc', 'Test 3 Failed: Description was overwritten';
  ASSERT (SELECT return_requested_at FROM public.order_items WHERE id = '77777777-0000-0000-0000-000000000002') = '2020-01-01'::timestamptz, 'Test 3 Failed: Timestamp was overwritten';

  -- Test 4: Success (none -> requested)
  v_res := public.create_return_request('77777777-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'Defective', 'Broken on arrival', v_photos);
  ASSERT (v_res->>'success')::boolean = true, 'Test 4 Failed: Expected success=true';
  ASSERT (v_res->>'isIdempotentReplay')::boolean = false, 'Test 4 Failed: Expected isIdempotentReplay=false';
  ASSERT v_res->'data'->>'returnStatus' = 'requested', 'Test 4 Failed: Expected returnStatus=requested';
  ASSERT v_res->'data'->>'returnRequestedAt' IS NOT NULL, 'Test 4 Failed: Expected returnRequestedAt';
  
  -- Verify state change
  ASSERT (SELECT return_status FROM public.order_items WHERE id = '77777777-0000-0000-0000-000000000001') = 'requested', 'Test 4 Failed: Row status was not mutated';
  ASSERT (SELECT return_reason FROM public.order_items WHERE id = '77777777-0000-0000-0000-000000000001') = 'Defective', 'Test 4 Failed: Row reason was not mutated';
  ASSERT (SELECT return_description FROM public.order_items WHERE id = '77777777-0000-0000-0000-000000000001') = 'Broken on arrival', 'Test 4 Failed: Row description was not mutated';
  ASSERT (SELECT array_length(return_photos, 1) FROM public.order_items WHERE id = '77777777-0000-0000-0000-000000000001') = 2, 'Test 4 Failed: Row photos were not mutated';
  ASSERT (SELECT return_requested_at FROM public.order_items WHERE id = '77777777-0000-0000-0000-000000000001') IS NOT NULL, 'Test 4 Failed: Row timestamp was not mutated';
  
  RAISE NOTICE 'All create_return_request tests passed successfully!';
END;
$$;

ROLLBACK;
