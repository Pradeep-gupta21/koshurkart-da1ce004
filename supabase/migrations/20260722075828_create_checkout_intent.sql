-- Migration: Phase 3 - Task 1: create_checkout_intent RPC
-- Description: Fully implemented atomic RPC for checkout intent creation. Handles Zero-Trust authorization, two-key idempotency, deterministic inventory locking, financial calculations, and atomic ledger entries.

CREATE OR REPLACE FUNCTION public.create_checkout_intent(
    p_customer_id UUID,
    p_order_items JSONB,
    p_delivery_address_id UUID,
    p_payment_method TEXT,
    p_client_nonce TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
SET search_path = public, pg_temp
AS $$
DECLARE
    v_item JSONB;
    v_product_uuid UUID;
    v_quantity INTEGER;
    v_product_record RECORD;
    v_validated_items JSONB := '[]'::jsonb;
    
    -- Financial calculation variables
    v_total_order_amount BIGINT := 0;
    v_total_vendor_earnings BIGINT := 0;
    v_total_platform_commission BIGINT := 0;
    v_item_subtotal BIGINT;
    v_item_vendor_earnings BIGINT;
    v_item_platform_commission BIGINT;
    
    -- TEMPORARY PHASE 2 COMPATIBILITY CONSTANT
    -- This intentionally mirrors the canonical implementation in src/shared/commission.ts.
    -- It must be replaced by the project's canonical configuration source (e.g., platform_settings) in a later phase.
    -- This constant exists only because PostgreSQL cannot directly call the shared TypeScript implementation.
    v_commission_percentage CONSTANT NUMERIC := 5;
    
    v_commission_basis_points BIGINT;
    v_vendor_share_basis_points BIGINT;
    v_basis_points CONSTANT BIGINT := 10000;
    v_financial_items JSONB := '[]'::jsonb;
    
    -- Persistence variables
    v_order_id UUID;
    v_payment_id UUID;
    v_payment_status TEXT;
    v_order_item_id UUID;
    v_ledger_entry_id UUID;
    v_updated_financial_items JSONB := '[]'::jsonb;
    v_response_order_items JSONB := '[]'::jsonb;
    v_title TEXT;
    v_image TEXT;
    v_row_count INTEGER;
    v_updated_reserved_stock INTEGER;
    v_updated_stock INTEGER;
    v_operation_key TEXT := 'chk_' || gen_random_uuid()::text;
    v_item_index INTEGER := 1;
    v_inserted_operation_key TEXT;
    v_existing_operation_key TEXT;
BEGIN
    -------------------------------------------------------------------------
    -- Phase 3 - Step 2.5: Authorization (Zero-Trust)
    -------------------------------------------------------------------------
    -- SECURITY DEFINER forces us to manually verify the caller's identity.
    -- 1. Verify caller identity matches the requested customer.
    IF auth.uid() IS NULL OR p_customer_id <> auth.uid() THEN
        RETURN jsonb_build_object(
            'success', false,
            'data', NULL,
            'isIdempotentReplay', false,
            'errorCode', 'UNAUTHORIZED'
        );
    END IF;

    -- 2. Verify the requested delivery address belongs to the authenticated caller.
    -- If p_delivery_address_id is null, it will be caught safely by structural validation below.
    IF p_delivery_address_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 
        FROM public.user_locations 
        WHERE id = p_delivery_address_id 
          AND user_id = auth.uid()
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'data', NULL,
            'isIdempotentReplay', false,
            'errorCode', 'UNAUTHORIZED'
        );
    END IF;

    -------------------------------------------------------------------------
    -- Phase 3 - Step 3: Input Validation
    -------------------------------------------------------------------------

    -- Validate required parameters are present.
    -- PostgreSQL already enforces structural UUID validation for UUID parameters.
    IF p_customer_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'data', NULL,
            'isIdempotentReplay', false,
            'errorCode', 'VALIDATION_MISSING_CUSTOMER'
        );
    END IF;

    IF p_order_items IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'data', NULL,
            'isIdempotentReplay', false,
            'errorCode', 'VALIDATION_MISSING_ORDER_ITEMS'
        );
    END IF;

    IF p_delivery_address_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'data', NULL,
            'isIdempotentReplay', false,
            'errorCode', 'VALIDATION_MISSING_ADDRESS'
        );
    END IF;

    IF p_payment_method IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'data', NULL,
            'isIdempotentReplay', false,
            'errorCode', 'VALIDATION_MISSING_PAYMENT_METHOD'
        );
    END IF;

    -- Validate order_items is a non-empty JSON array.
    IF jsonb_typeof(p_order_items) <> 'array'
        OR jsonb_array_length(p_order_items) = 0
    THEN
        RETURN jsonb_build_object(
            'success', false,
            'data', NULL,
            'isIdempotentReplay', false,
            'errorCode', 'VALIDATION_FAILED'
        );
    END IF;

    -- Validate p_payment_method against the project's canonical payment methods.
    -- The allowed list ('razorpay', 'upi', 'cod') is defined natively in the
    -- Edge Function's Zod schema, serving as the canonical source of truth.
    IF p_payment_method NOT IN ('razorpay', 'upi', 'cod') THEN
        RETURN jsonb_build_object(
            'success', false,
            'data', NULL,
            'isIdempotentReplay', false,
            'errorCode', 'VALIDATION_FAILED'
        );
    END IF;

    -- Validate each order item.
    FOR v_item IN
        SELECT *
        FROM jsonb_array_elements(p_order_items)
    LOOP
        -- Every entry must be a JSON object.
        IF jsonb_typeof(v_item) <> 'object' THEN
            RETURN jsonb_build_object(
                'success', false,
                'data', NULL,
                'isIdempotentReplay', false,
                'errorCode', 'VALIDATION_FAILED'
            );
        END IF;

        -- Required fields must exist.
        -- Unknown fields are ignored to preserve forward compatibility.
        IF NOT (
            v_item ? 'product_id'
            AND v_item ? 'quantity'
        ) THEN
            RETURN jsonb_build_object(
                'success', false,
                'data', NULL,
                'isIdempotentReplay', false,
                'errorCode', 'VALIDATION_FAILED'
            );
        END IF;

        -- Validate product_id is a structurally valid UUID.
        BEGIN
            v_product_uuid := (v_item->>'product_id')::UUID;
        EXCEPTION
            WHEN invalid_text_representation THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'data', NULL,
                    'isIdempotentReplay', false,
                    'errorCode', 'VALIDATION_FAILED'
                );
        END;

        -- Quantity must be a JSON number.
        IF jsonb_typeof(v_item->'quantity') <> 'number' THEN
            RETURN jsonb_build_object(
                'success', false,
                'data', NULL,
                'isIdempotentReplay', false,
                'errorCode', 'VALIDATION_FAILED'
            );
        END IF;

        -- Validate quantity is a positive integer.
        BEGIN
            v_quantity := (v_item->>'quantity')::INTEGER;
        EXCEPTION
            WHEN invalid_text_representation OR numeric_value_out_of_range THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'data', NULL,
                    'isIdempotentReplay', false,
                    'errorCode', 'VALIDATION_FAILED'
                );
        END;

        IF v_quantity <= 0
            OR (v_item->>'quantity') <> v_quantity::TEXT
        THEN
            RETURN jsonb_build_object(
                'success', false,
                'data', NULL,
                'isIdempotentReplay', false,
                'errorCode', 'VALIDATION_FAILED'
            );
        END IF;
    END LOOP;

    -------------------------------------------------------------------------
    -- Phase 3 - Step 3.5: Atomic Idempotency Claim
    -------------------------------------------------------------------------
    IF p_client_nonce IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'data', NULL,
            'isIdempotentReplay', false,
            'errorCode', 'VALIDATION_MISSING_NONCE'
        );
    END IF;

    INSERT INTO public.nonce_operation_map (
        client_nonce, operation_key, operation_type
    ) VALUES (
        p_client_nonce, v_operation_key, 'checkout_intent'
    )
    ON CONFLICT (client_nonce) DO NOTHING
    RETURNING operation_key INTO v_inserted_operation_key;

    IF v_inserted_operation_key IS NULL THEN
        SELECT operation_key INTO v_existing_operation_key
        FROM public.nonce_operation_map
        WHERE client_nonce = p_client_nonce
          AND operation_type = 'checkout_intent';

        IF NOT FOUND THEN
            RETURN jsonb_build_object(
                'success', false,
                'data', NULL,
                'isIdempotentReplay', false,
                'errorCode', 'INVALID_NONCE'
            );
        END IF;

        SELECT order_id INTO v_order_id
        FROM public.ledger_entries
        WHERE operation_key = v_existing_operation_key
        LIMIT 1;

        IF v_order_id IS NULL THEN
            RETURN jsonb_build_object(
                'success', false,
                'data', NULL,
                'isIdempotentReplay', false,
                'errorCode', 'INTERNAL_ERROR'
            );
        END IF;

        -- Prevent IDOR: Ensure the reconstructed order actually belongs to the authenticated caller
        IF NOT EXISTS (
            SELECT 1
            FROM public.orders
            WHERE id = v_order_id
              AND user_id = p_customer_id
        ) THEN
            RETURN jsonb_build_object(
                'success', false,
                'data', NULL,
                'isIdempotentReplay', false,
                'errorCode', 'UNAUTHORIZED'
            );
        END IF;

        SELECT id, payment_status, ROUND(amount * 100)::BIGINT INTO v_payment_id, v_payment_status, v_total_order_amount
        FROM public.payments
        WHERE order_id = v_order_id
        LIMIT 1;

        SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
                'id', oi.id,
                'product_id', oi.product_id,
                'vendor_id', oi.vendor_id,
                'title', oi.title,
                'image', oi.image,
                'price_inr', oi.price,
                'quantity', oi.quantity,
                'line_subtotal_paise', ROUND(oi.price * oi.quantity * 100)::BIGINT,
                'vendor_earnings_paise', le.amount_paise,
                'platform_commission_paise', ROUND(oi.price * oi.quantity * 100)::BIGINT - le.amount_paise
            )
        ), '[]'::jsonb)
        INTO v_response_order_items
        FROM public.order_items oi
        JOIN public.ledger_entries le ON le.order_item_id = oi.id
        WHERE le.operation_key = v_existing_operation_key
          AND le.type = 'credit';

        RETURN jsonb_build_object(
            'success', true,
            'data', jsonb_build_object(
                'order_id', v_order_id,
                'order_items', v_response_order_items,
                'payment', jsonb_build_object(
                    'id', v_payment_id,
                    'status', v_payment_status,
                    'amount_paise', v_total_order_amount
                ),
                'operation_key', v_existing_operation_key
            ),
            'isIdempotentReplay', true,
            'errorCode', NULL
        );
    END IF;

    -------------------------------------------------------------------------
    -------------------------------------------------------------------------
    -- Phase 3 - Step 4: Product & Inventory Validation
    -------------------------------------------------------------------------

    -- 1. Safely lock all involved products in strict UUID order
    -- A PL/pgSQL loop is the safest approach in PostgreSQL to guarantee deterministic
    -- lock acquisition order, defeating any potential planner join-reordering that
    -- could cause deadlocks in concurrent checkouts.
    FOR v_product_uuid IN 
        SELECT DISTINCT (item->>'product_id')::UUID
        FROM jsonb_array_elements(p_order_items) item
        ORDER BY 1 ASC
    LOOP
        PERFORM 1 FROM public.products WHERE id = v_product_uuid FOR UPDATE;
    END LOOP;

    -- 2. Fetch the required product and vendor information.
    -- The product rows are already locked by the loop above, so no FOR UPDATE is needed here.
    FOR v_product_record IN
        WITH requested AS (
            SELECT 
                (item->>'product_id')::UUID AS product_id,
                SUM((item->>'quantity')::INTEGER) AS requested_qty
            FROM jsonb_array_elements(p_order_items) item
            GROUP BY 1
        )
        SELECT 
            r.product_id,
            r.requested_qty,
            p.vendor_id,
            p.status AS product_status,
            (p.stock - COALESCE(p.reserved_stock, 0)) AS available_stock,
            p.price,
            p.title,
            p.image,
            v.verification_status AS vendor_status
        FROM requested r
        LEFT JOIN public.products p ON p.id = r.product_id
        LEFT JOIN public.vendors v ON v.id = p.vendor_id
        ORDER BY r.product_id ASC
    LOOP
        -- 1. Validate Product Exists
        IF v_product_record.product_status IS NULL THEN
            DELETE FROM public.nonce_operation_map WHERE client_nonce = p_client_nonce;
            RETURN jsonb_build_object(
                'success', false,
                'data', NULL,
                'isIdempotentReplay', false,
                'errorCode', 'VALIDATION_FAILED'
            );
        END IF;

        -- 2. Validate Product Active
        IF v_product_record.product_status != 'active' THEN
            DELETE FROM public.nonce_operation_map WHERE client_nonce = p_client_nonce;
            RETURN jsonb_build_object(
                'success', false,
                'data', NULL,
                'isIdempotentReplay', false,
                'errorCode', 'VALIDATION_FAILED'
            );
        END IF;

        -- 3. Validate Vendor Exists
        IF v_product_record.vendor_status IS NULL THEN
            DELETE FROM public.nonce_operation_map WHERE client_nonce = p_client_nonce;
            RETURN jsonb_build_object(
                'success', false,
                'data', NULL,
                'isIdempotentReplay', false,
                'errorCode', 'VENDOR_NOT_FOUND'
            );
        END IF;

        -- 4. Validate Vendor Active
        IF v_product_record.vendor_status NOT IN ('approved', 'verified') THEN
            DELETE FROM public.nonce_operation_map WHERE client_nonce = p_client_nonce;
            RETURN jsonb_build_object(
                'success', false,
                'data', NULL,
                'isIdempotentReplay', false,
                'errorCode', 'VALIDATION_FAILED'
            );
        END IF;

        -- 5. Validate Inventory Record Exists
        IF v_product_record.available_stock IS NULL THEN
            DELETE FROM public.nonce_operation_map WHERE client_nonce = p_client_nonce;
            RETURN jsonb_build_object(
                'success', false,
                'data', NULL,
                'isIdempotentReplay', false,
                'errorCode', 'VALIDATION_FAILED'
            );
        END IF;

        -- 6. Validate Sufficient Stock
        IF v_product_record.available_stock < v_product_record.requested_qty THEN
            DELETE FROM public.nonce_operation_map WHERE client_nonce = p_client_nonce;
            RETURN jsonb_build_object(
                'success', false,
                'data', NULL,
                'isIdempotentReplay', false,
                'errorCode', 'VALIDATION_FAILED'
            );
        END IF;

        -- 7. Add to Validated Items Cache
        v_validated_items := v_validated_items || jsonb_build_object(
            'product_id', v_product_record.product_id,
            'vendor_id', v_product_record.vendor_id,
            'requested_qty', v_product_record.requested_qty,
            'price', v_product_record.price,
            'title', v_product_record.title,
            'image', v_product_record.image,
            'available_stock', v_product_record.available_stock
        );
    END LOOP;

    -------------------------------------------------------------------------
    -- Phase 3 - Step 5: Financial Calculations
    -------------------------------------------------------------------------

    v_commission_basis_points := ROUND(v_commission_percentage * 100);
    v_vendor_share_basis_points := v_basis_points - v_commission_basis_points;

    FOR v_item IN
        SELECT *
        FROM jsonb_array_elements(v_validated_items)
    LOOP
        -- Calculate line subtotal in integer paise (DB price is stored in INR)
        v_item_subtotal := ROUND((v_item->>'requested_qty')::INTEGER * (v_item->>'price')::NUMERIC * 100)::BIGINT;
        
        -- Exact arithmetic matching the TS shared module BigInt calculation:
        -- vendor_earnings = (orderAmountPaise * vendorShareBasisPoints) / BASIS_POINTS
        -- In SQL, integer division truncates towards zero (identical to JS BigInt division)
        v_item_vendor_earnings := (v_item_subtotal * v_vendor_share_basis_points) / v_basis_points;
        
        -- Platform commission is exactly the remainder, preserving the invariant
        v_item_platform_commission := v_item_subtotal - v_item_vendor_earnings;

        -- Accumulate order totals
        v_total_order_amount := v_total_order_amount + v_item_subtotal;
        v_total_vendor_earnings := v_total_vendor_earnings + v_item_vendor_earnings;
        v_total_platform_commission := v_total_platform_commission + v_item_platform_commission;

        -- Preserve Financial Data for Later Steps
        v_financial_items := v_financial_items || jsonb_build_object(
            'product_id', v_item->>'product_id',
            'vendor_id', v_item->>'vendor_id',
            'requested_qty', (v_item->>'requested_qty')::INTEGER,
            'price_inr', (v_item->>'price')::NUMERIC,
            'title', v_item->>'title',
            'image', v_item->>'image',
            'line_subtotal_paise', v_item_subtotal,
            'vendor_earnings_paise', v_item_vendor_earnings,
            'platform_commission_paise', v_item_platform_commission
        );
    END LOOP;

    -- Verify Financial Invariant
    -- total_order_amount = total_vendor_earnings + total_platform_commission
    IF v_total_order_amount <> (v_total_vendor_earnings + v_total_platform_commission) THEN
        DELETE FROM public.nonce_operation_map WHERE client_nonce = p_client_nonce;
        RETURN jsonb_build_object(
            'success', false,
            'data', NULL,
            'isIdempotentReplay', false,
            'errorCode', 'INTERNAL_ERROR'
        );
    END IF;

    -------------------------------------------------------------------------
    -- Phase 3 - Step 6: Order & Payment Creation
    -------------------------------------------------------------------------
    -- 1. Create the Order
    INSERT INTO public.orders (
        user_id,
        total_amount,
        payment_status,
        order_status
    ) VALUES (
        p_customer_id,
        v_total_order_amount / 100.0,
        'pending',
        'processing'
    ) RETURNING id INTO v_order_id;

    -- 2. Create Order Items
    v_updated_financial_items := '[]'::jsonb;
    FOR v_item IN
        SELECT *
        FROM jsonb_array_elements(v_financial_items)
    LOOP
        INSERT INTO public.order_items (
            order_id,
            product_id,
            vendor_id,
            title,
            image,
            price,
            quantity
        ) VALUES (
            v_order_id,
            (v_item->>'product_id')::UUID,
            (v_item->>'vendor_id')::UUID,
            v_item->>'title',
            v_item->>'image',
            (v_item->>'price_inr')::NUMERIC,
            (v_item->>'requested_qty')::INTEGER
        ) RETURNING id INTO v_order_item_id;
        
        v_item := jsonb_set(v_item, '{order_item_id}', to_jsonb(v_order_item_id));
        v_updated_financial_items := v_updated_financial_items || v_item;
    END LOOP;
    v_financial_items := v_updated_financial_items;

    -- 3. Create the Payment Record
    INSERT INTO public.payments (
        user_id,
        order_id,
        amount,
        payment_method,
        payment_status,
        platform_commission,
        commission_percentage,
        vendor_earnings
    ) VALUES (
        p_customer_id,
        v_order_id,
        v_total_order_amount / 100.0,
        p_payment_method,
        'pending',
        v_total_platform_commission / 100.0,
        v_commission_percentage,
        v_total_vendor_earnings / 100.0
    ) RETURNING id, payment_status INTO v_payment_id, v_payment_status;

    -------------------------------------------------------------------------
    -- Phase 3 - Step 7: Inventory Reservation
    -------------------------------------------------------------------------
    FOR v_item IN
        SELECT *
        FROM jsonb_array_elements(v_financial_items)
    LOOP
        UPDATE public.products
        SET reserved_stock = reserved_stock + (v_item->>'requested_qty')::INTEGER
        WHERE id = (v_item->>'product_id')::UUID
        RETURNING reserved_stock, stock INTO v_updated_reserved_stock, v_updated_stock;

        GET DIAGNOSTICS v_row_count = ROW_COUNT;
        IF v_row_count <> 1 THEN
            RAISE EXCEPTION 'Inventory update affected unexpected number of rows (%)', v_row_count USING ERRCODE = 'P0002';
        END IF;

        -- Defensive check: Invariant must hold (this should be impossible due to Step 4 locks)
        IF v_updated_reserved_stock > v_updated_stock THEN
            RAISE EXCEPTION 'Internal consistency failure: reserved_stock (%) exceeds total stock (%)', v_updated_reserved_stock, v_updated_stock USING ERRCODE = 'P0002';
        END IF;
    END LOOP;

    -------------------------------------------------------------------------
    -- Phase 3 - Step 8: Ledger Creation
    -------------------------------------------------------------------------
    FOR v_item IN
        SELECT *
        FROM jsonb_array_elements(v_financial_items)
    LOOP
        INSERT INTO public.ledger_entries (
            vendor_id,
            order_id,
            order_item_id,
            type,
            status,
            amount_paise,
            operation_key
        ) VALUES (
            (v_item->>'vendor_id')::UUID,
            v_order_id,
            (v_item->>'order_item_id')::UUID,
            'credit'::ledger_entry_type,
            'pending'::ledger_entry_status,
            (v_item->>'vendor_earnings_paise')::BIGINT,
            v_operation_key
        ) RETURNING id INTO v_ledger_entry_id;
        
        IF v_ledger_entry_id IS NULL THEN
            RAISE EXCEPTION 'Failed to create ledger entry for order item %', (v_item->>'order_item_id');
        END IF;
    END LOOP;

    -------------------------------------------------------------------------
    -- Phase 3 - Step 9: Response Construction
    -------------------------------------------------------------------------

    FOR v_item_index IN 0 .. jsonb_array_length(v_financial_items) - 1 LOOP
        v_item := v_financial_items->v_item_index;
        v_response_order_items := v_response_order_items || jsonb_build_object(
            'id', (v_item->>'order_item_id')::UUID,
            'product_id', (v_item->>'product_id')::UUID,
            'vendor_id', (v_item->>'vendor_id')::UUID,
            'title', v_item->>'title',
            'image', v_item->>'image',
            'price_inr', (v_item->>'price_inr')::NUMERIC,
            'quantity', (v_item->>'requested_qty')::INTEGER,
            'line_subtotal_paise', (v_item->>'line_subtotal_paise')::BIGINT,
            'vendor_earnings_paise', (v_item->>'vendor_earnings_paise')::BIGINT,
            'platform_commission_paise', (v_item->>'platform_commission_paise')::BIGINT
        );
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'data', jsonb_build_object(
            'order_id', v_order_id,
            'order_items', v_response_order_items,
            'payment', jsonb_build_object(
                'id', v_payment_id,
                'status', v_payment_status,
                'amount_paise', v_total_order_amount
            ),
            'operation_key', v_operation_key
        ),
        'isIdempotentReplay', false,
        'errorCode', NULL
    );

EXCEPTION
    WHEN OTHERS THEN
        -- Preserve underlying PostgreSQL errors for internal diagnostics and logging
        -- without leaking internal database details or SQLSTATEs to API consumers.
        RAISE WARNING '[create_checkout_intent] Transaction failed for customer %: % (SQLSTATE: %)', p_customer_id, SQLERRM, SQLSTATE;

        RETURN jsonb_build_object(
            'success', false,
            'data', NULL,
            'isIdempotentReplay', false,
            'errorCode', 'INTERNAL_ERROR'
        );
END;
$$;

REVOKE ALL
ON FUNCTION public.create_checkout_intent(UUID, JSONB, UUID, TEXT, TEXT)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.create_checkout_intent(UUID, JSONB, UUID, TEXT, TEXT)
TO service_role;

COMMENT ON FUNCTION public.create_checkout_intent(UUID, JSONB, UUID, TEXT, TEXT)
IS 'Creates a checkout intent atomically, handling two-key idempotency, deterministic inventory locking, financial invariants, and ledger creation.';