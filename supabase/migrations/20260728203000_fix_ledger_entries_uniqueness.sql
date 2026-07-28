-- ============================================================================
-- Migration: 20260728203000_fix_ledger_entries_uniqueness.sql
-- Description: Fix uniqueness constraint granularity for multi-item checkouts.
--
-- Background:
--   The previous constraint UNIQUE (operation_key, type) incorrectly assumed
--   a 1:1 mapping between an operation (like checkout) and a ledger entry type
--   (like credit). During multi-item checkouts, each order item legitimately
--   generates a separate credit ledger entry, sharing the same operation key.
--
--   This migration replaces the overly strict constraint with:
--   UNIQUE NULLS NOT DISTINCT (operation_key, type, order_item_id)
--
--   This preserves idempotency at the order-item level for checkouts and returns,
--   while also preserving operation-level idempotency for payouts (which have
--   a NULL order_item_id), natively preventing duplicate payout insertions.
--
-- Compatibility:
--   This migration requires PostgreSQL 15+ due to the NULLS NOT DISTINCT clause.
-- ============================================================================

DO $$
DECLARE
    major_version integer;
BEGIN
    -- Verify PostgreSQL 15+ is running
    SELECT current_setting('server_version_num')::integer / 10000 INTO major_version;
    
    IF major_version < 15 THEN
        RAISE EXCEPTION 'Incompatible PostgreSQL version (%). UNIQUE NULLS NOT DISTINCT requires PostgreSQL 15 or newer. For older versions, this must be rewritten using partial unique indexes.', major_version;
    END IF;
END $$;

-- 1. Drop the existing overly strict uniqueness constraint
ALTER TABLE public.ledger_entries
  DROP CONSTRAINT IF EXISTS ledger_entries_operation_key_type_key;

-- 2. Add the structurally correct idempotency boundary
ALTER TABLE public.ledger_entries
  ADD CONSTRAINT ledger_entries_operation_key_type_item_key
  UNIQUE NULLS NOT DISTINCT (operation_key, type, order_item_id);
