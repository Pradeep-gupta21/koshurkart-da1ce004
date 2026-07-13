-- Phase 5: Razorpay return reversal + refund id tracking.
--
-- The new vendor-approve-return edge function reverses the Route transfer (pulls
-- the vendor's share back to KoshurKart) and THEN refunds the customer, BEFORE
-- calling the existing vendor_approve_return RPC for the DB-side balance
-- reversal. These columns record the Razorpay reversal id and refund id so the
-- flow is:
--   * auditable  — every money movement is traceable back to a Razorpay entity;
--   * idempotent — a retry after a mid-flow failure detects work already done
--     (reversal id present -> skip reversal; refund id present -> skip refund)
--     instead of double-reversing or double-refunding.
--
-- These live on order_items (NOT payments) deliberately:
--   * Return approval is per-line-item: vendor_approve_return takes a single
--     _order_item_id, so the money movements are scoped to one order_items row.
--   * A single payment/order can have several items returned independently, each
--     producing its own partial reversal + partial refund. A single
--     payments.razorpay_refund_id column would collide/overwrite across items and
--     lose data.
--   * This mirrors Phase 4, which put razorpay_transfer_id / transfer_status on
--     order_items for exactly the same vendor/line scoping reason.
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS razorpay_reversal_id TEXT,
  ADD COLUMN IF NOT EXISTS razorpay_refund_id TEXT,
  ADD COLUMN IF NOT EXISTS return_refunded_at TIMESTAMPTZ;

-- Look up a line item by its refund/reversal id when reconciling against
-- Razorpay refund/reversal webhooks or support tickets.
CREATE INDEX IF NOT EXISTS idx_order_items_razorpay_refund_id
  ON public.order_items(razorpay_refund_id)
  WHERE razorpay_refund_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_order_items_razorpay_reversal_id
  ON public.order_items(razorpay_reversal_id)
  WHERE razorpay_reversal_id IS NOT NULL;
