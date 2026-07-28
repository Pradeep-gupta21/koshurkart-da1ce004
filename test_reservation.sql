BEGIN;

DO $$
DECLARE
    v_product_id UUID := '00000000-0000-0000-0000-000000000001';
    v_vendor_id UUID := 'b3b55a01-4475-430c-8bd5-1b483da59f77';
    v_category_id UUID := '190eecdb-4b62-4dc2-8815-f5b11a43a055';
    v_customer_id UUID;
    v_address_id UUID;
    v_stock INT;
    v_reserved INT;
    v_items JSONB;
BEGIN
    RAISE NOTICE '--- Starting Reservation Invariant Tests ---';

    -- Setup: Create dummy product
    INSERT INTO public.products (id, vendor_id, title, description, price, stock, reserved_stock, category_id, is_active)
    VALUES (v_product_id, v_vendor_id, 'Test Product', 'Desc', 100, 10, 0, v_category_id, true)
    ON CONFLICT (id) DO UPDATE SET stock = 10, reserved_stock = 0;

    -- Setup: Create dummy customer and address for RPC test
    INSERT INTO auth.users (id) VALUES ('00000000-0000-0000-0000-000000000002') ON CONFLICT DO NOTHING;
    v_customer_id := '00000000-0000-0000-0000-000000000002';
    
    INSERT INTO public.addresses (id, user_id, type, name, phone, address_line1, city, state, pin_code)
    VALUES ('00000000-0000-0000-0000-000000000003', v_customer_id, 'home', 'Test', '123', 'Line1', 'City', 'State', '123456')
    ON CONFLICT DO NOTHING;
    v_address_id := '00000000-0000-0000-0000-000000000003';

    -- Test 1: Reserve 5 stock (Simulating direct reserve math)
    UPDATE public.products SET reserved_stock = reserved_stock + 5 WHERE id = v_product_id
    RETURNING stock, reserved_stock INTO v_stock, v_reserved;
    
    ASSERT v_stock = 10, 'Test 1 Failed: Stock should remain 10, got ' || v_stock;
    ASSERT v_reserved = 5, 'Test 1 Failed: Reserved stock should be 5, got ' || v_reserved;
    RAISE NOTICE 'Test 1 Passed: Reserved 5 stock successfully.';

    -- Test 2: Confirm 3 stock (Simulating successful order confirmation)
    UPDATE public.products SET stock = stock - 3, reserved_stock = reserved_stock - 3 WHERE id = v_product_id
    RETURNING stock, reserved_stock INTO v_stock, v_reserved;
    
    ASSERT v_stock = 7, 'Test 2 Failed: Stock should be 7, got ' || v_stock;
    ASSERT v_reserved = 2, 'Test 2 Failed: Reserved stock should be 2, got ' || v_reserved;
    RAISE NOTICE 'Test 2 Passed: Confirmed 3 stock successfully.';

    -- Test 3: Cancel 2 stock (Simulating order cancellation / timeout)
    UPDATE public.products SET reserved_stock = reserved_stock - 2 WHERE id = v_product_id
    RETURNING stock, reserved_stock INTO v_stock, v_reserved;
    
    ASSERT v_stock = 7, 'Test 3 Failed: Stock should remain 7, got ' || v_stock;
    ASSERT v_reserved = 0, 'Test 3 Failed: Reserved stock should be 0, got ' || v_reserved;
    RAISE NOTICE 'Test 3 Passed: Cancelled 2 stock successfully.';

    -- Test 4: Negative Test - Try to cancel 1 more stock (Should trigger check_violation)
    BEGIN
        UPDATE public.products SET reserved_stock = reserved_stock - 1 WHERE id = v_product_id;
        RAISE EXCEPTION 'Test 4 Failed: Silently allowed reserved_stock to become negative!';
    EXCEPTION WHEN check_violation THEN
        -- Verify inventory remained completely unchanged
        SELECT stock, reserved_stock INTO v_stock, v_reserved FROM public.products WHERE id = v_product_id;
        ASSERT v_stock = 7, 'Test 4 Failed: Stock mutated during failed rollback!';
        ASSERT v_reserved = 0, 'Test 4 Failed: Reserved stock mutated during failed rollback!';
        RAISE NOTICE 'Test 4 Passed: Negative reserved_stock correctly blocked and rolled back.';
    END;

    -- Test 5: Negative Test - Try to set reserved_stock to NULL (Should trigger not_null_violation)
    BEGIN
        UPDATE public.products SET reserved_stock = NULL WHERE id = v_product_id;
        RAISE EXCEPTION 'Test 5 Failed: Silently allowed reserved_stock to become NULL!';
    EXCEPTION WHEN not_null_violation THEN
        SELECT stock, reserved_stock INTO v_stock, v_reserved FROM public.products WHERE id = v_product_id;
        ASSERT v_stock = 7 AND v_reserved = 0, 'Test 5 Failed: State mutated during NULL rollback!';
        RAISE NOTICE 'Test 5 Passed: NULL reserved_stock correctly blocked and rolled back.';
    END;

    -- Test 6: Negative Test - Try to reserve more than available stock using the actual RPC
    BEGIN
        -- Build items JSON requesting 10 qty (only 7 available)
        v_items := jsonb_build_array(
            jsonb_build_object('product_id', v_product_id, 'requested_qty', 10, 'vendor_id', v_vendor_id, 'price', 100)
        );
        
        PERFORM public.create_checkout_intent(
            v_customer_id,
            v_address_id,
            v_items
        );
        RAISE EXCEPTION 'Test 6 Failed: RPC silently allowed reservation exceeding available stock!';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%exceeds total stock%' OR SQLERRM LIKE '%Insufficient stock%' OR SQLERRM LIKE '%Internal consistency failure%' THEN
            -- Verify inventory remained completely unchanged
            SELECT stock, reserved_stock INTO v_stock, v_reserved FROM public.products WHERE id = v_product_id;
            ASSERT v_stock = 7, 'Test 6 Failed: Stock mutated during over-reservation rollback!';
            ASSERT v_reserved = 0, 'Test 6 Failed: Reserved stock mutated during over-reservation rollback!';
            RAISE NOTICE 'Test 6 Passed: Over-reserving via RPC correctly blocked and rolled back. (%)', SQLERRM;
        ELSE
            RAISE EXCEPTION 'Test 6 Failed: Unexpected error type: %', SQLERRM;
        END IF;
    END;

    RAISE NOTICE '--- All Reservation Invariant Tests Passed Successfully ---';
END $$;

ROLLBACK;
