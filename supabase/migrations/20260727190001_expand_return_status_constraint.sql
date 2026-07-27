-- ============================================================================
-- Migration: 20260727190001_expand_return_status_constraint.sql
-- Phase: 4 — Task 2.8 (Architecture Alignment) — Part 1
--
-- Purpose:
--   Expand the order_items.return_status CHECK constraint to include the
--   canonical state values defined in the authoritative architecture
--   specification (02-state-machines.md §3).
--
--   Two new values are added:
--     'escalated' — the return is blocked pending finance_admin resolution
--                   due to insufficient vendor balance (previously and
--                   incorrectly represented by the overloaded 'approved' value)
--     'refunding' — the Razorpay transfer reversal is confirmed; the customer
--                   refund Razorpay call is in progress
--
-- Backward compatibility:
--   All existing values are preserved without modification. No existing rows
--   are affected. Legacy values ('processing', 'refunded') remain to support
--   pre-Phase-4 records.
--
-- Spec refs:
--   02-state-machines.md §3 (Return & Refund Lifecycle)
--   ADR document: Phase 4 Task 3.1A, Decision 2 and Decision 3
-- ============================================================================

ALTER TABLE public.order_items
  DROP CONSTRAINT IF EXISTS order_items_return_status_check;

ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_return_status_check
  CHECK (return_status IN (
    'none',        -- no return requested
    'requested',   -- customer submitted return; awaiting vendor
    'processing',  -- legacy: pre-Phase-4 interim lock state
    'reversing',   -- approve_return_intent: Razorpay reversal pending
    'refunding',   -- create_return_reversal_confirm: reversal confirmed; Razorpay refund pending
    'escalated',   -- approve_return_intent: insufficient balance; finance_admin action required
    'approved',    -- create_return_refund_confirm: return fully complete (TERMINAL)
    'rejected',    -- vendor or finance_admin rejected the return (TERMINAL)
    'refunded'     -- legacy: pre-Phase-4 terminal state
  ));
