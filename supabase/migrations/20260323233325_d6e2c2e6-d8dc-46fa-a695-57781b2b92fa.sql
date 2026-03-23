
-- Re-create all triggers idempotently

-- 1. Payment success → update vendor earnings
DROP TRIGGER IF EXISTS trigger_on_payment_success ON public.payments;
CREATE TRIGGER trigger_on_payment_success
  AFTER UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.on_payment_success();

-- 2. Shipping status change → log shipment events + sync order status (BEFORE)
DROP TRIGGER IF EXISTS trigger_on_shipping_status_change ON public.orders;
CREATE TRIGGER trigger_on_shipping_status_change
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.on_shipping_status_change();

-- 3. Shipping notify user (AFTER)
DROP TRIGGER IF EXISTS trigger_on_shipping_notify_user ON public.orders;
CREATE TRIGGER trigger_on_shipping_notify_user
  AFTER UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.on_shipping_notify_user();

-- 4. Order status change → recalculate vendor trust + increment sales
DROP TRIGGER IF EXISTS trigger_on_order_status_change ON public.orders;
CREATE TRIGGER trigger_on_order_status_change
  AFTER UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.on_order_status_change();

-- 5. Order item inserted → notify vendor
DROP TRIGGER IF EXISTS trigger_on_order_item_notify_vendor ON public.order_items;
CREATE TRIGGER trigger_on_order_item_notify_vendor
  AFTER INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.on_order_item_notify_vendor();

-- 6. Review inserted → recalculate vendor trust score
DROP TRIGGER IF EXISTS trigger_on_review_insert ON public.reviews;
CREATE TRIGGER trigger_on_review_insert
  AFTER INSERT ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.on_review_insert();

-- 7. Review inserted → notify vendor
DROP TRIGGER IF EXISTS trigger_on_review_notify_vendor ON public.reviews;
CREATE TRIGGER trigger_on_review_notify_vendor
  AFTER INSERT ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.on_review_notify_vendor();

-- 8. Flag suspicious reviews (BEFORE INSERT)
DROP TRIGGER IF EXISTS trigger_flag_suspicious_review ON public.reviews;
CREATE TRIGGER trigger_flag_suspicious_review
  BEFORE INSERT ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.flag_suspicious_review();

-- 9. Vendor verified → notify
DROP TRIGGER IF EXISTS trigger_on_vendor_verified_notify ON public.vendors;
CREATE TRIGGER trigger_on_vendor_verified_notify
  AFTER UPDATE ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION public.on_vendor_verified_notify();

-- 10. Analytics event → increment view count
DROP TRIGGER IF EXISTS trigger_on_analytics_event_insert ON public.analytics_events;
CREATE TRIGGER trigger_on_analytics_event_insert
  AFTER INSERT ON public.analytics_events
  FOR EACH ROW EXECUTE FUNCTION public.on_analytics_event_insert();

-- 11. Purchase conversion → increment ad conversions
DROP TRIGGER IF EXISTS trigger_on_purchase_conversion ON public.analytics_events;
CREATE TRIGGER trigger_on_purchase_conversion
  AFTER INSERT ON public.analytics_events
  FOR EACH ROW EXECUTE FUNCTION public.on_purchase_conversion();

-- 12. Products search vector update
DROP TRIGGER IF EXISTS trigger_products_search_vector ON public.products;
CREATE TRIGGER trigger_products_search_vector
  BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.products_search_vector_update();
