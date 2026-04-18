-- ============================================================
-- 1. Make on_payment_success idempotent (prevent double credit)
-- ============================================================

-- Add credited_at column to track if vendor earnings were already credited
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS credited_at timestamptz;

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
      END LOOP;
    END IF;

    -- Mark as credited (idempotency guard)
    NEW.credited_at := now();
  END IF;
  RETURN NEW;
END;
$function$;

-- ============================================================
-- 2. Re-attach ALL triggers (idempotent: drop + create)
-- ============================================================

-- Payment success → credit vendors (BEFORE so we can set credited_at)
DROP TRIGGER IF EXISTS trigger_on_payment_success ON public.payments;
CREATE TRIGGER trigger_on_payment_success
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.on_payment_success();

-- Shipping status change → log event + sync order_status (BEFORE so NEW.order_status persists)
DROP TRIGGER IF EXISTS trigger_on_shipping_status_change ON public.orders;
CREATE TRIGGER trigger_on_shipping_status_change
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.on_shipping_status_change();

-- Shipping status change → notify user
DROP TRIGGER IF EXISTS trigger_on_shipping_notify_user ON public.orders;
CREATE TRIGGER trigger_on_shipping_notify_user
  AFTER UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.on_shipping_notify_user();

-- Order status change → trust score + sales count
DROP TRIGGER IF EXISTS trigger_on_order_status_change ON public.orders;
CREATE TRIGGER trigger_on_order_status_change
  AFTER UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.on_order_status_change();

-- Order item insert → notify vendor
DROP TRIGGER IF EXISTS trigger_on_order_item_notify_vendor ON public.order_items;
CREATE TRIGGER trigger_on_order_item_notify_vendor
  AFTER INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.on_order_item_notify_vendor();

-- Review insert → recalc vendor trust score
DROP TRIGGER IF EXISTS trigger_on_review_insert ON public.reviews;
CREATE TRIGGER trigger_on_review_insert
  AFTER INSERT ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.on_review_insert();

-- Review insert → notify vendor
DROP TRIGGER IF EXISTS trigger_on_review_notify_vendor ON public.reviews;
CREATE TRIGGER trigger_on_review_notify_vendor
  AFTER INSERT ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.on_review_notify_vendor();

-- Review insert → flag suspicious (BEFORE so we can mutate NEW)
DROP TRIGGER IF EXISTS trigger_flag_suspicious_review ON public.reviews;
CREATE TRIGGER trigger_flag_suspicious_review
  BEFORE INSERT ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.flag_suspicious_review();

-- Vendor verified → notify
DROP TRIGGER IF EXISTS trigger_on_vendor_verified_notify ON public.vendors;
CREATE TRIGGER trigger_on_vendor_verified_notify
  AFTER UPDATE ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION public.on_vendor_verified_notify();

-- Analytics event → bump product view count
DROP TRIGGER IF EXISTS trigger_on_analytics_event_insert ON public.analytics_events;
CREATE TRIGGER trigger_on_analytics_event_insert
  AFTER INSERT ON public.analytics_events
  FOR EACH ROW EXECUTE FUNCTION public.on_analytics_event_insert();

-- Analytics event → ad conversion
DROP TRIGGER IF EXISTS trigger_on_purchase_conversion ON public.analytics_events;
CREATE TRIGGER trigger_on_purchase_conversion
  AFTER INSERT ON public.analytics_events
  FOR EACH ROW EXECUTE FUNCTION public.on_purchase_conversion();

-- Product search vector
DROP TRIGGER IF EXISTS trigger_products_search_vector ON public.products;
CREATE TRIGGER trigger_products_search_vector
  BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.products_search_vector_update();

-- Auth: new user → profile + role
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();