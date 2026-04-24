CREATE OR REPLACE FUNCTION public.notify_admins_of_payment_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _admin record;
  _title text;
  _msg text;
BEGIN
  IF NEW.event_type NOT IN ('payment_amount_mismatch', 'checkout_quote_mismatch', 'amount_assertion_failed') THEN
    RETURN NEW;
  END IF;

  _title := CASE NEW.event_type
    WHEN 'payment_amount_mismatch' THEN 'Payment Amount Mismatch Detected'
    WHEN 'amount_assertion_failed' THEN 'Amount Assertion Failed (paise mismatch)'
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
$function$;