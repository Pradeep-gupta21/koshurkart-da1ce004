-- ============================================================
-- 1. COD auto-credit on delivery
-- ============================================================
CREATE OR REPLACE FUNCTION public.on_cod_delivered_credit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.shipping_status = 'delivered'
     AND OLD.shipping_status IS DISTINCT FROM NEW.shipping_status THEN
    UPDATE public.payments
    SET payment_status = 'success'
    WHERE order_id = NEW.id
      AND payment_method = 'cod'
      AND payment_status <> 'success';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_on_cod_delivered_credit ON public.orders;
CREATE TRIGGER trg_on_cod_delivered_credit
AFTER UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.on_cod_delivered_credit();

-- ============================================================
-- 2. Payout validation + auto-debit
-- ============================================================
ALTER TABLE public.payouts
  ADD COLUMN IF NOT EXISTS debited_at timestamptz;

CREATE OR REPLACE FUNCTION public.validate_payout_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _vendor record;
BEGIN
  IF NEW.amount IS NULL OR NEW.amount <= 0 THEN
    RAISE EXCEPTION 'Payout amount must be greater than zero';
  END IF;

  SELECT withdrawable_balance, bank_verified, kyc_status
  INTO _vendor
  FROM public.vendors
  WHERE id = NEW.vendor_id;

  IF _vendor IS NULL THEN
    RAISE EXCEPTION 'Vendor not found';
  END IF;

  IF _vendor.kyc_status <> 'approved' THEN
    RAISE EXCEPTION 'KYC must be approved before requesting a payout';
  END IF;

  IF _vendor.bank_verified IS NOT TRUE THEN
    RAISE EXCEPTION 'Bank account must be verified before requesting a payout';
  END IF;

  IF NEW.amount > COALESCE(_vendor.withdrawable_balance, 0) THEN
    RAISE EXCEPTION 'Insufficient withdrawable balance (available: %)', COALESCE(_vendor.withdrawable_balance, 0);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_payout_request ON public.payouts;
CREATE TRIGGER trg_validate_payout_request
BEFORE INSERT ON public.payouts
FOR EACH ROW
EXECUTE FUNCTION public.validate_payout_request();

CREATE OR REPLACE FUNCTION public.debit_balance_on_payout_complete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed'
     AND OLD.status IS DISTINCT FROM 'completed'
     AND NEW.debited_at IS NULL THEN
    UPDATE public.vendors
    SET withdrawable_balance = GREATEST(COALESCE(withdrawable_balance, 0) - NEW.amount, 0)
    WHERE id = NEW.vendor_id;

    NEW.debited_at := now();
    NEW.processed_at := COALESCE(NEW.processed_at, now());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_debit_balance_on_payout_complete ON public.payouts;
CREATE TRIGGER trg_debit_balance_on_payout_complete
BEFORE UPDATE ON public.payouts
FOR EACH ROW
EXECUTE FUNCTION public.debit_balance_on_payout_complete();

-- ============================================================
-- 3. Earnings reversal on cancel/return
-- ============================================================
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz;

CREATE OR REPLACE FUNCTION public.on_order_refund_reverse_earnings()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _payment record;
  _total_items numeric;
  _vendor_share numeric;
  _was_delivered boolean;
  _item record;
  _vendor_row record;
BEGIN
  IF NEW.order_status NOT IN ('cancelled', 'returned') THEN
    RETURN NEW;
  END IF;
  IF OLD.order_status = NEW.order_status THEN
    RETURN NEW;
  END IF;

  SELECT * INTO _payment
  FROM public.payments
  WHERE order_id = NEW.id
    AND credited_at IS NOT NULL
    AND reversed_at IS NULL
  LIMIT 1;

  IF _payment.id IS NULL THEN
    RETURN NEW;
  END IF;

  _was_delivered := (OLD.order_status = 'delivered');

  SELECT SUM(price * quantity) INTO _total_items
  FROM public.order_items WHERE order_id = NEW.id;

  IF COALESCE(_total_items, 0) > 0 THEN
    FOR _vendor_row IN
      SELECT vendor_id, SUM(price * quantity) AS item_total
      FROM public.order_items
      WHERE order_id = NEW.id AND vendor_id IS NOT NULL
      GROUP BY vendor_id
    LOOP
      _vendor_share := (COALESCE(_payment.vendor_earnings, _payment.amount) * _vendor_row.item_total) / _total_items;

      UPDATE public.vendors
      SET total_earnings = GREATEST(COALESCE(total_earnings, 0) - _vendor_share, 0),
          withdrawable_balance = GREATEST(COALESCE(withdrawable_balance, 0) - _vendor_share, 0),
          total_sales = GREATEST(COALESCE(total_sales, 0) - 1, 0)
      WHERE id = _vendor_row.vendor_id;

      -- Shadow ledger: mirror the reversal debit in the same transaction.
      INSERT INTO public.vendor_wallet_ledger
        (vendor_id, order_id, type, amount, description)
      VALUES
        (_vendor_row.vendor_id, NEW.id, 'return_deduction', -_vendor_share,
         'Earnings reversed on order ' || NEW.order_status);
    END LOOP;
  END IF;

  -- Release inventory + roll back sales_count if delivered
  FOR _item IN
    SELECT product_id, quantity FROM public.order_items
    WHERE order_id = NEW.id AND product_id IS NOT NULL
  LOOP
    IF _was_delivered THEN
      UPDATE public.products
      SET sales_count = GREATEST(sales_count - _item.quantity, 0)
      WHERE id = _item.product_id;
    ELSE
      -- If still reserved (not yet delivered), release
      PERFORM public.release_stock(_item.product_id, _item.quantity);
    END IF;
  END LOOP;

  UPDATE public.payments
  SET credited_at = NULL,
      reversed_at = now()
  WHERE id = _payment.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_on_order_refund_reverse_earnings ON public.orders;
CREATE TRIGGER trg_on_order_refund_reverse_earnings
AFTER UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.on_order_refund_reverse_earnings();

-- ============================================================
-- 4. Stale order sweeper
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.sweep_stale_orders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _order record;
  _item record;
  _count integer := 0;
BEGIN
  FOR _order IN
    SELECT o.id
    FROM public.orders o
    WHERE o.order_status = 'processing'
      AND o.payment_status = 'pending'
      AND o.created_at < now() - interval '30 minutes'
      AND NOT EXISTS (
        SELECT 1 FROM public.payments p
        WHERE p.order_id = o.id AND p.payment_method = 'cod'
      )
  LOOP
    UPDATE public.orders
    SET order_status = 'cancelled',
        payment_status = 'failed'
    WHERE id = _order.id;

    UPDATE public.payments
    SET payment_status = 'failed'
    WHERE order_id = _order.id AND payment_status = 'pending';

    FOR _item IN
      SELECT product_id, quantity FROM public.order_items
      WHERE order_id = _order.id AND product_id IS NOT NULL
    LOOP
      PERFORM public.release_stock(_item.product_id, _item.quantity);
    END LOOP;

    INSERT INTO public.analytics_events (event_type, metadata)
    VALUES ('order_auto_cancelled', jsonb_build_object('order_id', _order.id, 'reason', 'stale_pending_payment'));

    _count := _count + 1;
  END LOOP;

  RETURN _count;
END;
$$;

-- Schedule sweep every 10 minutes (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule('sweep-stale-orders');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'sweep-stale-orders',
  '*/10 * * * *',
  $$SELECT public.sweep_stale_orders();$$
);