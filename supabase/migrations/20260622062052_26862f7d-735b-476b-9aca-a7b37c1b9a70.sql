
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS checkout_display_name text NOT NULL DEFAULT 'store',
  ADD COLUMN IF NOT EXISTS razorpay_account_id text;

ALTER TABLE public.vendors
  DROP CONSTRAINT IF EXISTS vendors_checkout_display_name_check;
ALTER TABLE public.vendors
  ADD CONSTRAINT vendors_checkout_display_name_check
  CHECK (checkout_display_name IN ('store', 'bank'));
