-- 1. Idempotency key on orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS orders_user_idem_key_uniq
  ON public.orders (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- 2. Real-time admin alerts on payment-amount/quote mismatches
CREATE OR REPLACE FUNCTION public.notify_admins_of_payment_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _admin record;
  _title text;
  _msg text;
BEGIN
  IF NEW.event_type NOT IN ('payment_amount_mismatch', 'checkout_quote_mismatch') THEN
    RETURN NEW;
  END IF;

  _title := CASE NEW.event_type
    WHEN 'payment_amount_mismatch' THEN 'Payment Amount Mismatch Detected'
    ELSE 'Checkout Quote Mismatch Detected'
  END;

  _msg := 'A payment alert was logged: ' || COALESCE(NEW.metadata::text, '{}');

  FOR _admin IN
    SELECT user_id FROM public.user_roles WHERE role = 'admin'
  LOOP
    PERFORM public.create_notification(
      _admin.user_id,
      'payment_alert',
      _title,
      LEFT(_msg, 500),
      NEW.id,
      COALESCE(NEW.metadata, '{}'::jsonb) || jsonb_build_object('event_type', NEW.event_type)
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_admins_payment_alert ON public.analytics_events;
CREATE TRIGGER trg_notify_admins_payment_alert
  AFTER INSERT ON public.analytics_events
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_admins_of_payment_alert();