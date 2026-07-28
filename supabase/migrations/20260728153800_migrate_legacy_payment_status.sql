-- Migration: Normalize legacy payment_status values.
-- Previous versions of admin_process_payment wrote 'completed'.
-- The canonical payment vocabulary is now:
-- pending | success | failed.
-- This migration is idempotent and safely converts all remaining
-- legacy rows before the new payment confirmation RPC is used.

DO $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE public.orders
    SET payment_status = 'success'
    WHERE payment_status = 'completed';

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    RAISE NOTICE 'Migrated % legacy orders with payment_status = completed to success', v_updated_count;
END $$;
