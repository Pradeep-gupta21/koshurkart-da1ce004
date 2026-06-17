
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS webhook_confirmed_at timestamptz;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS reconciliation_flagged boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reconciliation_flagged_at timestamptz,
  ADD COLUMN IF NOT EXISTS reconciliation_reason text;

CREATE INDEX IF NOT EXISTS idx_orders_reconciliation_flagged
  ON public.orders (reconciliation_flagged) WHERE reconciliation_flagged = true;
CREATE INDEX IF NOT EXISTS idx_payments_webhook_confirmed_at
  ON public.payments (webhook_confirmed_at) WHERE webhook_confirmed_at IS NULL;

-- Reconciliation function: flag confirmed Razorpay orders older than 1h
-- where neither verify-razorpay-payment logged verify_success nor a matching
-- webhook_events row exists for the razorpay_order_id.
CREATE OR REPLACE FUNCTION public.flag_unreconciled_razorpay_orders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _flagged integer := 0;
BEGIN
  WITH suspects AS (
    SELECT o.id AS order_id, p.id AS payment_id, p.razorpay_order_id
    FROM public.orders o
    JOIN public.payments p ON p.order_id = o.id
    WHERE o.order_status = 'confirmed'
      AND o.reconciliation_flagged = false
      AND p.payment_status = 'success'
      AND p.payment_method = 'razorpay'
      AND p.razorpay_order_id IS NOT NULL
      AND p.created_at < now() - interval '1 hour'
      AND p.webhook_confirmed_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.webhook_events we
        WHERE we.provider = 'razorpay'
          AND we.payload->'payload'->'payment'->'entity'->>'order_id' = p.razorpay_order_id
          AND we.event_type IN ('payment.captured','order.paid')
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.payment_logs pl
        WHERE pl.payment_id = p.id
          AND pl.event_type = 'verify_success'
      )
  ), updated AS (
    UPDATE public.orders o
    SET reconciliation_flagged = true,
        reconciliation_flagged_at = now(),
        reconciliation_reason = 'Razorpay payment success without webhook confirmation or verify_success log within 1h'
    FROM suspects s
    WHERE o.id = s.order_id
    RETURNING o.id
  )
  SELECT count(*) INTO _flagged FROM updated;

  -- Log against the payment row for visibility in admin sheet
  INSERT INTO public.payment_logs (payment_id, event_type, message, metadata)
  SELECT s.payment_id, 'reconciliation_flagged',
         'Order flagged for admin review (no webhook confirmation within 1h)',
         jsonb_build_object('razorpay_order_id', s.razorpay_order_id)
  FROM (
    SELECT p.id AS payment_id, p.razorpay_order_id
    FROM public.payments p
    JOIN public.orders o ON o.id = p.order_id
    WHERE o.reconciliation_flagged = true
      AND o.reconciliation_flagged_at > now() - interval '5 minutes'
      AND p.payment_method = 'razorpay'
  ) s;

  RETURN _flagged;
END;
$$;

REVOKE ALL ON FUNCTION public.flag_unreconciled_razorpay_orders() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.flag_unreconciled_razorpay_orders() TO service_role;

-- Admin views: unreconciled paid payments + stuck pending Razorpay payments
CREATE OR REPLACE VIEW public.admin_unreconciled_payments
WITH (security_invoker = true) AS
SELECT p.id AS payment_id,
       p.order_id,
       p.amount,
       p.razorpay_order_id,
       p.razorpay_payment_id,
       p.created_at AS payment_created_at,
       p.webhook_confirmed_at,
       o.reconciliation_flagged,
       o.reconciliation_flagged_at,
       o.reconciliation_reason,
       o.order_status
FROM public.payments p
JOIN public.orders o ON o.id = p.order_id
WHERE p.payment_method = 'razorpay'
  AND p.payment_status = 'success'
  AND p.webhook_confirmed_at IS NULL
  AND p.created_at < now() - interval '1 hour';

GRANT SELECT ON public.admin_unreconciled_payments TO authenticated;

CREATE OR REPLACE VIEW public.admin_stuck_pending_razorpay_payments
WITH (security_invoker = true) AS
SELECT p.id AS payment_id,
       p.order_id,
       p.amount,
       p.razorpay_order_id,
       p.razorpay_payment_id,
       p.payment_status,
       p.created_at AS payment_created_at,
       o.order_status
FROM public.payments p
JOIN public.orders o ON o.id = p.order_id
WHERE p.payment_method = 'razorpay'
  AND p.payment_status IN ('pending','pending_verification')
  AND p.razorpay_order_id IS NOT NULL
  AND p.razorpay_payment_id IS NULL
  AND p.created_at < now() - interval '30 minutes';

GRANT SELECT ON public.admin_stuck_pending_razorpay_payments TO authenticated;
