-- Regression suite for Issue #21 (Idempotent Replay Hydration for create_checkout_intent)

BEGIN;
SET CONSTRAINTS ALL DEFERRED;

DO $$
DECLARE
    v_customer_id UUID;
    v_vendor_id UUID;
    v_product_id UUID;
    v_address_id UUID;
    v_client_nonce TEXT;
    
    v_result1 JSONB;
    v_result2 JSONB;
    v_result3 JSONB;
    v_result4 JSONB;
    
    v_order_id UUID;
    v_payment_id UUID;
    
    v_order_items JSONB;
BEGIN
    -- 1. Setup Test Fixtures
    -- Create customer
    v_customer_id := gen_random_uuid();
    INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES (v_customer_id, 'customer_issue21@example.com', '{"terms_accepted": true, "name": "Issue21 Customer"}');
    
    v_address_id := gen_random_uuid();
    INSERT INTO public.user_locations (id, user_id, label, city, state, pincode)
    VALUES (v_address_id, v_customer_id, '123 Test St', 'Srinagar', 'JK', '190001');

    -- Create vendor
    v_vendor_id := gen_random_uuid();
    INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES (v_vendor_id, 'vendor_issue21@example.com', '{"terms_accepted": true, "name": "Issue21 Vendor", "store_name": "Issue21 Store"}');
    
    UPDATE public.vendors
    SET verification_status = 'approved',
        payment_setup_completed = true
    WHERE user_id = v_vendor_id
    RETURNING id INTO v_vendor_id;

    -- Create product
    v_product_id := gen_random_uuid();
    INSERT INTO public.products (id, vendor_id, title, slug, price, stock, status)
    VALUES (v_product_id, v_vendor_id, 'Test Product Issue21', 'test-product-issue21', 1000.00, 100, 'active');

    v_order_items := jsonb_build_array(
        jsonb_build_object('product_id', v_product_id, 'quantity', 2)
    );

    v_client_nonce := 'test_nonce_issue21_123';

    -- Mock auth context for SECURITY DEFINER verification
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_customer_id::text, 'role', 'authenticated')::text, true);
    
    -- SCENARIO 1: Fresh checkout succeeds
    RAISE NOTICE 'Executing Scenario 1: Fresh checkout';
    v_result1 := public.create_checkout_intent(
        v_customer_id,
        v_order_items,
        v_address_id,
        'razorpay',
        v_client_nonce
    );
    
    IF v_result1->>'success' IS DISTINCT FROM 'true' THEN
        RAISE EXCEPTION 'Scenario 1 failed: fresh checkout did not succeed. Result: %', v_result1;
    END IF;
    IF v_result1->>'isIdempotentReplay' IS DISTINCT FROM 'false' THEN
        RAISE EXCEPTION 'Scenario 1 failed: isIdempotentReplay must be false for fresh checkout.';
    END IF;
    
    v_order_id := (v_result1->'data'->>'order_id')::UUID;
    v_payment_id := (v_result1->'data'->'payment'->>'id')::UUID;
    
    -- SCENARIO 2: Exact nonce replay succeeds with identical non-null financial provenance
    RAISE NOTICE 'Executing Scenario 2: Exact nonce replay';
    v_result2 := public.create_checkout_intent(
        v_customer_id,
        v_order_items,
        v_address_id,
        'razorpay',
        v_client_nonce
    );

    IF v_result2->>'success' IS DISTINCT FROM 'true' THEN
        RAISE EXCEPTION 'Scenario 2 failed: replay checkout did not succeed. Result: %', v_result2;
    END IF;
    IF v_result2->>'isIdempotentReplay' IS DISTINCT FROM 'true' THEN
        RAISE EXCEPTION 'Scenario 2 failed: isIdempotentReplay must be true for replay.';
    END IF;
    IF (v_result2->'data'->'payment'->>'amount_paise') IS NULL THEN
        RAISE EXCEPTION 'Scenario 2 failed: amount_paise is NULL.';
    END IF;
    IF (v_result2->'data'->'payment'->>'status') IS NULL THEN
        RAISE EXCEPTION 'Scenario 2 failed: status is NULL.';
    END IF;
    IF v_result2->'data' IS DISTINCT FROM v_result1->'data' THEN
        RAISE EXCEPTION 'Scenario 2 failed: replay data does not match original data. Orig: %, Replay: %', v_result1->'data', v_result2->'data';
    END IF;
    
    -- SCENARIO 3: Deterministic payment selection
    RAISE NOTICE 'Executing Scenario 3: Deterministic payment selection with multiple payment rows';
    -- Insert a second payment for the same order, creating ambiguity (simulate a retry logic inserting a new row).
    -- Ensure it has a slightly later created_at to test ORDER BY created_at DESC.
    -- (We use pg_sleep to ensure a strictly later timestamp if needed, but since we insert sequentially it usually is later).
    INSERT INTO public.payments (order_id, user_id, amount, payment_method, payment_status)
    VALUES (v_order_id, v_customer_id, 2000.00, 'razorpay', 'pending');
    
    v_result3 := public.create_checkout_intent(
        v_customer_id,
        v_order_items,
        v_address_id,
        'razorpay',
        v_client_nonce
    );
    
    IF v_result3->>'success' IS DISTINCT FROM 'true' THEN
        RAISE EXCEPTION 'Scenario 3 failed: replay did not succeed after ambiguous payment insert.';
    END IF;
    
    -- Should resolve the latest payment (which has amount 2000.00, thus 200000 paise).
    IF (v_result3->'data'->'payment'->>'amount_paise') IS DISTINCT FROM '200000' THEN
        RAISE EXCEPTION 'Scenario 3 failed: deterministic canonical selection failed. Expected amount_paise 200000, got: %', v_result3->'data'->'payment'->>'amount_paise';
    END IF;
    
    -- SCENARIO 4: Missing payment provenance fails with REPLAY_INCONSISTENT_STATE
    RAISE NOTICE 'Executing Scenario 4: Missing payment provenance';
    -- Delete all payments for the order
    DELETE FROM public.payments WHERE order_id = v_order_id;
    
    v_result4 := public.create_checkout_intent(
        v_customer_id,
        v_order_items,
        v_address_id,
        'razorpay',
        v_client_nonce
    );
    
    IF v_result4->>'success' IS DISTINCT FROM 'false' THEN
        RAISE EXCEPTION 'Scenario 4 failed: replay must fail when payment is missing. Result: %', v_result4;
    END IF;
    
    IF v_result4->>'errorCode' IS DISTINCT FROM 'REPLAY_INCONSISTENT_STATE' THEN
        RAISE EXCEPTION 'Scenario 4 failed: errorCode must be REPLAY_INCONSISTENT_STATE, got: %', v_result4->>'errorCode';
    END IF;
    
    RAISE NOTICE 'All Issue #21 test scenarios passed successfully.';
END $$;

ROLLBACK;
