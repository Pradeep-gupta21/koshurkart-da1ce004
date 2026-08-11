CREATE OR REPLACE FUNCTION public.recalculate_withdrawable_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance numeric;
BEGIN
  IF NEW.vendor_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(
    SUM(
      CASE
        WHEN type IN ('credit', 'refund') AND status = 'confirmed' THEN amount_paise
        WHEN type IN ('debit', 'reservation', 'payout', 'reversal') AND status IN ('pending', 'confirmed') THEN -amount_paise
        ELSE 0
      END
    ), 0
  ) INTO v_new_balance
  FROM ledger_entries
  WHERE vendor_id = NEW.vendor_id;

  UPDATE vendors
  SET withdrawable_balance = v_new_balance
  WHERE id = NEW.vendor_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_recalculate_withdrawable_balance
  AFTER INSERT OR UPDATE ON public.ledger_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.recalculate_withdrawable_balance();
