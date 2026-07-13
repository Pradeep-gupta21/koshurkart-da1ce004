-- ============================================================
-- Shadow audit ledger: mirror every vendor credit & payout debit
-- into vendor_wallet_ledger in the SAME transaction that mutates
-- the live balance column. vendors.withdrawable_balance remains
-- the authoritative source the app reads from; this ledger is a
-- structural shadow so drift can be detected/reconstructed.
--
-- Only the two balance-mutating trigger functions are altered here
-- (bodies preserved verbatim; the sole addition is one INSERT into
-- vendor_wallet_ledger at the exact balance-mutation point).
-- Sign convention matches the existing return_deduction insert:
--   credit       -> positive amount
--   payout_debit -> negative amount
-- ============================================================

-- 1) Payment-success credit trigger: add a 'credit' ledger row per vendor.
CREATE OR REPLACE FUNCTION public.on_payment_success()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _item record;
  _total_items numeric;
  _vendor_share numeric;
BEGIN
  -- Only fire when status transitions to 'success' AND not already credited
  IF NEW.payment_status = 'success'
     AND (OLD.payment_status IS DISTINCT FROM 'success')
     AND NEW.credited_at IS NULL THEN

    SELECT SUM(price * quantity) INTO _total_items
    FROM order_items WHERE order_id = NEW.order_id;

    IF COALESCE(_total_items, 0) > 0 THEN
      FOR _item IN
        SELECT vendor_id, SUM(price * quantity) AS item_total
        FROM order_items
        WHERE order_id = NEW.order_id AND vendor_id IS NOT NULL
        GROUP BY vendor_id
      LOOP
        _vendor_share := (COALESCE(NEW.vendor_earnings, NEW.amount) * _item.item_total) / _total_items;

        UPDATE vendors
        SET total_earnings = COALESCE(total_earnings, 0) + _vendor_share,
            withdrawable_balance = COALESCE(withdrawable_balance, 0) + _vendor_share,
            total_sales = COALESCE(total_sales, 0) + 1
        WHERE id = _item.vendor_id;

        -- Shadow ledger: mirror the credit in the same transaction.
        INSERT INTO public.vendor_wallet_ledger (vendor_id, order_id, type, amount, description)
        VALUES (_item.vendor_id, NEW.order_id, 'credit', _vendor_share,
                'Payment credited for order ' || NEW.order_id::text);
      END LOOP;
    END IF;

    -- Mark as credited (idempotency guard)
    NEW.credited_at := now();
  END IF;
  RETURN NEW;
END;
$function$;

-- 2) Payout-completion debit trigger: add a 'payout_debit' ledger row (negative).
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

    -- Shadow ledger: mirror the debit in the same transaction.
    -- No dedicated payout_id column exists on vendor_wallet_ledger,
    -- so the payout id is recorded in the description.
    INSERT INTO public.vendor_wallet_ledger (vendor_id, type, amount, description)
    VALUES (NEW.vendor_id, 'payout_debit', -NEW.amount,
            'Payout completed (payout id ' || NEW.id::text || ')');

    NEW.debited_at := now();
    NEW.processed_at := COALESCE(NEW.processed_at, now());
  END IF;
  RETURN NEW;
END;
$$;

-- 3) Admin-only read-only reconciliation RPC (not wired into any UI yet).
--    Compares the shadow ledger sum against the live balance column.
CREATE OR REPLACE FUNCTION public.reconcile_vendor_ledger(_vendor_id uuid)
RETURNS TABLE (
  vendor_id uuid,
  ledger_sum numeric,
  withdrawable_balance numeric,
  difference numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT
    v.id,
    COALESCE((SELECT SUM(l.amount)
              FROM public.vendor_wallet_ledger l
              WHERE l.vendor_id = v.id), 0)::numeric AS ledger_sum,
    COALESCE(v.withdrawable_balance, 0) AS withdrawable_balance,
    (COALESCE(v.withdrawable_balance, 0)
      - COALESCE((SELECT SUM(l.amount)
                  FROM public.vendor_wallet_ledger l
                  WHERE l.vendor_id = v.id), 0))::numeric AS difference
  FROM public.vendors v
  WHERE v.id = _vendor_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reconcile_vendor_ledger(uuid) TO authenticated;
