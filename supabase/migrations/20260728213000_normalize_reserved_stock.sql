-- ============================================================================
-- Migration: 20260728213000_normalize_reserved_stock.sql
-- Description: Enforce NOT NULL and positive invariants for reserved_stock.
--
-- Background:
--   The reserved_stock column tracks pending inventory reservations.
--   If reserved_stock is allowed to be NULL, arithmetic operations like
--   `reserved_stock = reserved_stock + qty` result in NULL. Subsequent
--   comparisons (e.g. NULL > stock) evaluate to falsy, silently bypassing
--   inventory reservation checks and allowing infinite overselling.
--
--   This migration mathematically eliminates the vulnerability at the schema
--   level by normalizing legacy rows to 0 and enforcing a strict NOT NULL
--   constraint alongside a CHECK (reserved_stock >= 0) invariant.
-- ============================================================================

-- 1. Safely normalize any legacy NULL or negative rows to 0
UPDATE public.products 
SET reserved_stock = 0 
WHERE reserved_stock IS NULL OR reserved_stock < 0;

-- 2. Enforce the NOT NULL and DEFAULT invariant
ALTER TABLE public.products 
  ALTER COLUMN reserved_stock SET DEFAULT 0,
  ALTER COLUMN reserved_stock SET NOT NULL;

-- 3. Enforce the business logic invariant (cannot reserve less than 0)
ALTER TABLE public.products 
  ADD CONSTRAINT products_reserved_stock_check 
  CHECK (reserved_stock >= 0);
