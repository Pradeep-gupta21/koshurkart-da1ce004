-- Rewrite vendor_approve_return for concurrency safety.
--
-- Key changes vs. the original:
--   1. SELECT ... FOR UPDATE on order_items — serialises concurrent RPC calls that
--      slip past the edge-function optimistic lock (e.g. two invocations race).
--   2. Status guard now expects 'processing' (set atomically by the edge function
--      before any Razorpay calls) instead of 'requested'.
--   3. Status transition: processing → approved.

-- Drop the old 1-argument overload so only the new secured 2-argument
-- signature exists after this migration runs.
DROP FUNCTION IF EXISTS public.vendor_approve_return(uuid);

CREATE OR REPLACE FUNCTION public.vendor_approve_return(_order_item_id uuid, _caller_vendor_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _vendor_id   uuid;
  _order_id    uuid;
  _price       numeric;
  _qty         integer;
  _status      text;
  _title       text;
  _amount      numeric;
  _payment     record;
  _total_items numeric;
BEGIN
  -- Row-level lock: serialises concurrent calls so the balance deduction
  -- cannot run twice for the same item.
  SELECT oi.vendor_id, oi.order_id, oi.price, oi.quantity, oi.return_status, oi.title
    INTO _vendor_id, _order_id, _price, _qty, _status, _title
  FROM public.order_items oi
  WHERE oi.id = _order_item_id
  FOR UPDATE;

  IF _vendor_id IS NULL THEN
    RAISE EXCEPTION 'Order item not found';
  END IF;

  -- Verify the caller is the actual vendor for this order item.
  -- This check uses explicit data-level authorization rather than auth.uid(),
  -- which is unreliable when called via service_role (returns NULL).
  IF _vendor_id IS DISTINCT FROM _caller_vendor_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- The edge function atomically transitions requested → processing before any
  -- Razorpay calls, so by the time we reach this RPC the status must be 'processing'.
  IF _status <> 'processing' THEN
    RAISE EXCEPTION 'Return is not in processing state (current: %)', _status;
  END IF;

  SELECT * INTO _payment
  FROM public.payments
  WHERE order_id = _order_id AND credited_at IS NOT NULL
  LIMIT 1;

  SELECT SUM(price * quantity) INTO _total_items
  FROM public.order_items WHERE order_id = _order_id;

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
     SET total_earnings       = GREATEST(COALESCE(total_earnings, 0) - _amount, 0),
         withdrawable_balance = GREATEST(COALESCE(withdrawable_balance, 0) - _amount, 0)
   WHERE id = _vendor_id;

  INSERT INTO public.vendor_wallet_ledger
    (vendor_id, order_id, order_item_id, type, amount, description)
  VALUES
    (_vendor_id, _order_id, _order_item_id, 'return_deduction', -_amount,
     'Return approved for "' || COALESCE(_title, 'item') || '"');
END;
$$;
