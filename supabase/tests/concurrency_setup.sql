BEGIN;
DO $$
DECLARE
    v_customer_id uuid := 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
    v_vendor_id uuid := 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
    v_product_id uuid := 'f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
    v_order_id uuid := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
    v_payment_id uuid := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';
    v_order_item_id uuid := 'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
BEGIN
    INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data) 
    VALUES (v_customer_id, 'authenticated', 'authenticated', 'customer@example.com', '{"terms_accepted": true}') ON CONFLICT DO NOTHING;
    INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data) 
    VALUES (v_vendor_id, 'authenticated', 'authenticated', 'vendor@example.com', '{"terms_accepted": true}') ON CONFLICT DO NOTHING;
    
    INSERT INTO public.vendors (id, user_id, store_name, store_slug) 
    VALUES (v_vendor_id, v_vendor_id, 'Test Store', 'test-store-1') ON CONFLICT DO NOTHING;

    INSERT INTO public.products (id, vendor_id, title, slug, description, price, stock) 
    VALUES (v_product_id, v_vendor_id, 'Test Product', 'test-product', 'Test', 100, 100) ON CONFLICT DO NOTHING;

    INSERT INTO public.orders (id, user_id, payment_status, total_amount)
    VALUES (v_order_id, v_customer_id, 'pending', 100) ON CONFLICT DO NOTHING;

    -- Done
END $$;
COMMIT;
