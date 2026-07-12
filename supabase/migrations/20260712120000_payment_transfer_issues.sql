-- Phase 2: silent-skip visibility.
-- When create-checkout builds the Razorpay Route transfers[] array, a vendor is
-- skipped when they have no razorpay_account_id or their share is below Route's
-- minimum transfer amount. Previously this was only console.warn'd — the order
-- completed for the customer while that vendor silently received nothing, with
-- zero queryable trace. This table + flag make those skips visible and
-- actionable for admins. Additive only; never blocks checkout.

CREATE TABLE IF NOT EXISTS public.payment_transfer_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  vendor_id uuid REFERENCES public.vendors(id) ON DELETE CASCADE,
  reason text, -- e.g. 'missing_razorpay_account_id', 'share_below_min'
  amount_paise integer,
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Admin dashboards list open issues newest-first; index the unresolved set.
CREATE INDEX IF NOT EXISTS payment_transfer_issues_unresolved_idx
  ON public.payment_transfer_issues (created_at DESC)
  WHERE resolved = false;

CREATE INDEX IF NOT EXISTS payment_transfer_issues_order_idx
  ON public.payment_transfer_issues (order_id);

ALTER TABLE public.payment_transfer_issues ENABLE ROW LEVEL SECURITY;

-- Admins review and resolve transfer issues (same has_role pattern as
-- public.payments). Edge functions write these rows with the service-role key,
-- which bypasses RLS entirely — the same way create-checkout already inserts
-- into public.payments — so no explicit service-role/INSERT policy is needed.
CREATE POLICY "Admin reads transfer issues" ON public.payment_transfer_issues
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin updates transfer issues" ON public.payment_transfer_issues
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Quick flag on the payment row so affected orders are spottable at a glance.
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS has_transfer_issues boolean NOT NULL DEFAULT false;
