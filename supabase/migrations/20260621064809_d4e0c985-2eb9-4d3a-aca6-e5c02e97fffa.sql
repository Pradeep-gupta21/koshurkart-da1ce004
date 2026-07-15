
-- 1) Wallet ledger table
CREATE TABLE IF NOT EXISTS public.vendor_wallet_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  order_item_id uuid REFERENCES public.order_items(id) ON DELETE SET NULL,
  type text NOT NULL,
  amount numeric NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vendor_wallet_ledger_vendor_idx
  ON public.vendor_wallet_ledger (vendor_id, created_at DESC);

GRANT SELECT ON public.vendor_wallet_ledger TO authenticated;
GRANT ALL ON public.vendor_wallet_ledger TO service_role;

ALTER TABLE public.vendor_wallet_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vendors view their own ledger"
  ON public.vendor_wallet_ledger FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

-- 2) Approve return RPC
CREATE OR REPLACE FUNCTION public.vendor_approve_return(_order_item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _vendor_id uuid;
  _user_id uuid;
  _order_id uuid;
  _price numeric;
  _qty integer;
  _status text;
  _title text;
  _amount numeric;
  _payment record;
  _total_items numeric;
BEGIN
  SELECT oi.vendor_id, oi.order_id, oi.price, oi.quantity, oi.return_status, oi.title
    INTO _vendor_id, _order_id, _price, _qty, _status, _title
  FROM public.order_items oi
  WHERE oi.id = _order_item_id;

  IF _vendor_id IS NULL THEN
    RAISE EXCEPTION 'Order item not found';
  END IF;

  SELECT v.user_id INTO _user_id FROM public.vendors v WHERE v.id = _vendor_id;
  IF _user_id IS DISTINCT FROM auth.uid() AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF _status <> 'requested' THEN
    RAISE EXCEPTION 'Return is not in requested state (current: %)', _status;
  END IF;

  -- Look up the payment that credited this order so we debit the same
  -- vendor_earnings share that was originally credited (not the raw line price).
  SELECT * INTO _payment
  FROM public.payments
  WHERE order_id = _order_id AND credited_at IS NOT NULL
  LIMIT 1;

  -- Sum of all order line totals (same denominator used in the credit formula).
  SELECT SUM(price * quantity) INTO _total_items
  FROM public.order_items WHERE order_id = _order_id;

  -- This line item's proportional share of vendor_earnings, mirroring the
  -- on_payment_success credit formula exactly.
  _amount := COALESCE(
    (COALESCE(_payment.vendor_earnings, _payment.amount)
     * (COALESCE(_price, 0) * COALESCE(_qty, 0)))
    / NULLIF(_total_items, 0),
    0
  );

  UPDATE public.order_items
     SET return_status = 'approved'
   WHERE id = _order_item_id;

  UPDATE public.vendors
     SET total_earnings = GREATEST(COALESCE(total_earnings, 0) - _amount, 0),
         withdrawable_balance = GREATEST(COALESCE(withdrawable_balance, 0) - _amount, 0)
   WHERE id = _vendor_id;

  INSERT INTO public.vendor_wallet_ledger (vendor_id, order_id, order_item_id, type, amount, description)
  VALUES (_vendor_id, _order_id, _order_item_id, 'return_deduction', -_amount,
          'Return approved for "' || COALESCE(_title, 'item') || '"');
END;
$$;

-- 3) Reject return RPC
CREATE OR REPLACE FUNCTION public.vendor_reject_return(_order_item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _vendor_id uuid;
  _user_id uuid;
  _status text;
BEGIN
  SELECT oi.vendor_id, oi.return_status INTO _vendor_id, _status
  FROM public.order_items oi WHERE oi.id = _order_item_id;

  IF _vendor_id IS NULL THEN
    RAISE EXCEPTION 'Order item not found';
  END IF;

  SELECT v.user_id INTO _user_id FROM public.vendors v WHERE v.id = _vendor_id;
  IF _user_id IS DISTINCT FROM auth.uid() AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF _status <> 'requested' THEN
    RAISE EXCEPTION 'Return is not in requested state (current: %)', _status;
  END IF;

  UPDATE public.order_items
     SET return_status = 'rejected'
   WHERE id = _order_item_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.vendor_approve_return(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.vendor_reject_return(uuid) TO authenticated;
