-- ============================================================================
-- Migration: 20260801000000_harden_refund_ledger_uniqueness.sql
-- Phase: 4 — Hardening
--
-- Description: 
--   Enforces a strict ONE customer refund per order item business invariant
--   at the database level.
--
-- Background:
--   KoshurKart models partial order refunds by refunding distinct order_items
--   individually. A single order_item corresponds to a line item, and gets
--   exactly ONE customer refund. KoshurKart does not support partial-quantity 
--   returns within a single order_item row.
--
--   This migration adds a partial unique index guaranteeing that no
--   more than one platform customer refund (vendor_id IS NULL) can exist per
--   order item, regardless of the generated operation key.
--
-- Preflight:
--   Safely detects existing historical duplicate refund rows and fails closed
--   (RAISE EXCEPTION) to prevent silent corruption or indexing failure.
-- ============================================================================

DO $$
DECLARE
    v_duplicate_count INTEGER;
    v_affected_items TEXT;
BEGIN
    -- 1. Preflight Audit: Check for existing duplicates
    WITH duplicates AS (
        SELECT order_item_id, COUNT(*) as duplicate_count
        FROM public.ledger_entries
        WHERE type = 'refund'
          AND vendor_id IS NULL
          AND status = 'confirmed'
          AND order_item_id IS NOT NULL
        GROUP BY order_item_id
        HAVING COUNT(*) > 1
    )
    SELECT 
        COUNT(*),
        string_agg(order_item_id::text || ' (' || duplicate_count || ' rows)', ', ')
    INTO 
        v_duplicate_count,
        v_affected_items
    FROM duplicates;

    -- 2. Fail closed if duplicates exist
    IF v_duplicate_count > 0 THEN
        RAISE EXCEPTION 'MIGRATION ABORTED: Found % order items with duplicate customer refund ledger rows. These require manual reconciliation. Affected items: %', 
            v_duplicate_count, v_affected_items;
    END IF;
END $$;

-- 3. Create the partial unique index (safe to run if it already exists)
CREATE UNIQUE INDEX IF NOT EXISTS ledger_entries_one_customer_refund_per_item_idx
ON public.ledger_entries(order_item_id)
WHERE type = 'refund' AND vendor_id IS NULL AND status = 'confirmed';
