
-- 1. Dedupe indexes on payments
CREATE UNIQUE INDEX IF NOT EXISTS payments_razorpay_payment_id_uniq
  ON public.payments (razorpay_payment_id)
  WHERE razorpay_payment_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payments_transaction_id_uniq
  ON public.payments (transaction_id)
  WHERE transaction_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payments_one_success_per_order
  ON public.payments (order_id)
  WHERE payment_status = 'success';

-- Performance composite index
CREATE INDEX IF NOT EXISTS payments_order_status_idx
  ON public.payments (order_id, payment_status);

-- 2. Payment audit log
CREATE TABLE IF NOT EXISTS public.payment_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL,
  old_status text,
  new_status text,
  actor_user_id uuid,
  source text NOT NULL DEFAULT 'trigger',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_audit_log_payment_idx
  ON public.payment_audit_log (payment_id, created_at DESC);

ALTER TABLE public.payment_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read payment audit"
  ON public.payment_audit_log FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.on_payment_status_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.payment_audit_log (payment_id, old_status, new_status, actor_user_id, source)
    VALUES (NEW.id, NULL, NEW.payment_status, auth.uid(), 'insert');
  ELSIF TG_OP = 'UPDATE' AND OLD.payment_status IS DISTINCT FROM NEW.payment_status THEN
    INSERT INTO public.payment_audit_log (payment_id, old_status, new_status, actor_user_id, source)
    VALUES (NEW.id, OLD.payment_status, NEW.payment_status, auth.uid(), 'update');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_status_audit ON public.payments;
CREATE TRIGGER trg_payment_status_audit
AFTER INSERT OR UPDATE OF payment_status ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.on_payment_status_audit();

-- 3. Webhook events dedupe
CREATE TABLE IF NOT EXISTS public.webhook_events (
  provider_event_id text PRIMARY KEY,
  provider text NOT NULL,
  event_type text,
  processed_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb
);

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read webhook events"
  ON public.webhook_events FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 4. Private payment-proofs bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-proofs', 'payment-proofs', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users upload own payment proofs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'payment-proofs'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users read own payment proofs"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'payment-proofs'
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR has_role(auth.uid(), 'admin'::app_role)
  )
);
