
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'card',
  payment_provider TEXT DEFAULT NULL,
  transaction_id TEXT DEFAULT NULL,
  payment_status TEXT NOT NULL DEFAULT 'pending',
  platform_commission NUMERIC DEFAULT 0,
  commission_percentage NUMERIC DEFAULT 10,
  vendor_earnings NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Users can read their own payments
CREATE POLICY "Users read own payments" ON public.payments
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Users can insert their own payments
CREATE POLICY "Users insert own payments" ON public.payments
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Vendors can read payments for orders containing their items
CREATE POLICY "Vendors read order payments" ON public.payments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM order_items oi
      JOIN vendors v ON v.id = oi.vendor_id
      WHERE oi.order_id = payments.order_id
        AND v.user_id = auth.uid()
    )
  );

-- Admins can read and update all payments
CREATE POLICY "Admin reads all payments" ON public.payments
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin updates payments" ON public.payments
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
