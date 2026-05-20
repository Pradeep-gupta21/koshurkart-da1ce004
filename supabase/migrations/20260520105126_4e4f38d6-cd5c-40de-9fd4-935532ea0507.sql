
CREATE TABLE IF NOT EXISTS public.payment_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL,
  event_type text NOT NULL,
  message text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_logs_payment_id ON public.payment_logs(payment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_logs_event_type ON public.payment_logs(event_type);

ALTER TABLE public.payment_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read all payment logs"
ON public.payment_logs FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users read own payment logs"
ON public.payment_logs FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.payments p WHERE p.id = payment_logs.payment_id AND p.user_id = auth.uid()));

CREATE POLICY "Vendors read order payment logs"
ON public.payment_logs FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1
  FROM public.payments p
  JOIN public.order_items oi ON oi.order_id = p.order_id
  JOIN public.vendors v ON v.id = oi.vendor_id
  WHERE p.id = payment_logs.payment_id AND v.user_id = auth.uid()
));

CREATE OR REPLACE FUNCTION public.log_payment_event(
  p_payment_id uuid,
  p_event_type text,
  p_message text DEFAULT '',
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.payment_logs (payment_id, event_type, message, metadata)
  VALUES (p_payment_id, p_event_type, COALESCE(p_message, ''), COALESCE(p_metadata, '{}'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.on_payment_status_log()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_payment_event(
      NEW.id, 'payment_created',
      'Payment record created with status ' || NEW.payment_status,
      jsonb_build_object('status', NEW.payment_status, 'method', NEW.payment_method, 'amount', NEW.amount)
    );
  ELSIF TG_OP = 'UPDATE' AND OLD.payment_status IS DISTINCT FROM NEW.payment_status THEN
    PERFORM public.log_payment_event(
      NEW.id, 'status_changed',
      'Status changed from ' || COALESCE(OLD.payment_status, 'null') || ' to ' || NEW.payment_status,
      jsonb_build_object('old', OLD.payment_status, 'new', NEW.payment_status, 'method', NEW.payment_method)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_status_log ON public.payments;
CREATE TRIGGER trg_payment_status_log
AFTER INSERT OR UPDATE OF payment_status ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.on_payment_status_log();
