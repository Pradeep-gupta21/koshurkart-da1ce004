
-- Add earnings columns to vendors
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS total_earnings numeric DEFAULT 0;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS withdrawable_balance numeric DEFAULT 0;

-- Trigger function: when payment status becomes 'success', credit vendor earnings
CREATE OR REPLACE FUNCTION public.on_payment_success()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _vendor_id uuid;
  _item record;
  _total_items numeric;
  _vendor_share numeric;
BEGIN
  -- Only fire when status changes to 'success'
  IF NEW.payment_status = 'success' AND (OLD.payment_status IS DISTINCT FROM 'success') THEN
    -- Calculate total order item value per vendor
    FOR _item IN
      SELECT vendor_id, SUM(price * quantity) as item_total
      FROM order_items
      WHERE order_id = NEW.order_id AND vendor_id IS NOT NULL
      GROUP BY vendor_id
    LOOP
      -- Each vendor gets their proportional share of vendor_earnings
      SELECT SUM(price * quantity) INTO _total_items
      FROM order_items WHERE order_id = NEW.order_id;

      IF _total_items > 0 THEN
        _vendor_share := (COALESCE(NEW.vendor_earnings, NEW.amount) * _item.item_total) / _total_items;
      ELSE
        _vendor_share := 0;
      END IF;

      UPDATE vendors
      SET total_earnings = COALESCE(total_earnings, 0) + _vendor_share,
          withdrawable_balance = COALESCE(withdrawable_balance, 0) + _vendor_share,
          total_sales = COALESCE(total_sales, 0) + 1
      WHERE id = _item.vendor_id;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger on payments table
DROP TRIGGER IF EXISTS trg_payment_success ON payments;
CREATE TRIGGER trg_payment_success
  AFTER UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION on_payment_success();

-- Also fire on INSERT with status = 'success' (edge case)
DROP TRIGGER IF EXISTS trg_payment_success_insert ON payments;
CREATE TRIGGER trg_payment_success_insert
  AFTER INSERT ON payments
  FOR EACH ROW
  WHEN (NEW.payment_status = 'success')
  EXECUTE FUNCTION on_payment_success();
