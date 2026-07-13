
-- Phase 4: Razorpay Route transfer webhook tracking.
-- Per-vendor-per-line-item transfer status, populated by the razorpay-webhook
-- function on transfer.processed / transfer.failed events. Transfers are
-- per-vendor-per-line-item, so these live on order_items (already vendor-scoped)
-- rather than payments.
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS razorpay_transfer_id TEXT,
  ADD COLUMN IF NOT EXISTS transfer_status TEXT,
  ADD COLUMN IF NOT EXISTS transfer_processed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS transfer_error JSONB;

ALTER TABLE public.order_items
  DROP CONSTRAINT IF EXISTS order_items_transfer_status_check;
ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_transfer_status_check
  CHECK (transfer_status IS NULL OR transfer_status IN ('processed','failed'));

CREATE INDEX IF NOT EXISTS idx_order_items_razorpay_transfer_id ON public.order_items(razorpay_transfer_id);
CREATE INDEX IF NOT EXISTS idx_order_items_transfer_status ON public.order_items(transfer_status) WHERE transfer_status IS NOT NULL;
