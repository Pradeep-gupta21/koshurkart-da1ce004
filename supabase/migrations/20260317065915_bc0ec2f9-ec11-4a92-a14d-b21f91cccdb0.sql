
-- Create notifications table
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  entity_id UUID DEFAULT NULL,
  metadata JSONB DEFAULT '{}',
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can read own notifications
CREATE POLICY "Users read own notifications" ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Users can update own notifications (mark as read)
CREATE POLICY "Users update own notifications" ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Security definer function to create notifications (called by triggers)
CREATE OR REPLACE FUNCTION public.create_notification(
  _user_id UUID,
  _type TEXT,
  _title TEXT,
  _message TEXT,
  _entity_id UUID DEFAULT NULL,
  _metadata JSONB DEFAULT '{}'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO notifications (user_id, type, title, message, entity_id, metadata)
  VALUES (_user_id, _type, _title, _message, _entity_id, _metadata);
END;
$$;

-- Trigger: on order placed, notify vendors
CREATE OR REPLACE FUNCTION public.on_order_placed_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _vendor_user_id UUID;
  _vendor_record RECORD;
BEGIN
  -- Notify each distinct vendor that has items in this order
  -- We need a slight delay approach: use a deferred check or just query order_items
  -- Since order_items may be inserted after the order, we use a trigger on order_items instead
  RETURN NEW;
END;
$$;

-- Better: trigger on order_items INSERT to notify vendor
CREATE OR REPLACE FUNCTION public.on_order_item_notify_vendor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _vendor_user_id UUID;
BEGIN
  IF NEW.vendor_id IS NOT NULL THEN
    SELECT user_id INTO _vendor_user_id FROM vendors WHERE id = NEW.vendor_id;
    IF _vendor_user_id IS NOT NULL THEN
      PERFORM create_notification(
        _vendor_user_id,
        'order_placed',
        'New Order Received',
        'You have a new order for "' || NEW.title || '" (x' || NEW.quantity || ')',
        NEW.order_id,
        jsonb_build_object('product_title', NEW.title, 'quantity', NEW.quantity)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_order_item_notify_vendor
  AFTER INSERT ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.on_order_item_notify_vendor();

-- Trigger: on shipping status change to shipped/delivered, notify user
CREATE OR REPLACE FUNCTION public.on_shipping_notify_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.shipping_status IS DISTINCT FROM NEW.shipping_status THEN
    IF NEW.shipping_status = 'shipped' THEN
      PERFORM create_notification(
        NEW.user_id,
        'order_shipped',
        'Order Shipped',
        'Your order #' || LEFT(NEW.id::text, 8) || ' has been shipped!',
        NEW.id,
        '{}'::jsonb
      );
    ELSIF NEW.shipping_status = 'delivered' THEN
      PERFORM create_notification(
        NEW.user_id,
        'order_delivered',
        'Order Delivered',
        'Your order #' || LEFT(NEW.id::text, 8) || ' has been delivered!',
        NEW.id,
        '{}'::jsonb
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_shipping_notify_user
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.on_shipping_notify_user();

-- Trigger: on vendor verified, notify vendor user
CREATE OR REPLACE FUNCTION public.on_vendor_verified_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.verification_status IS DISTINCT FROM NEW.verification_status
     AND NEW.verification_status = 'approved' THEN
    PERFORM create_notification(
      NEW.user_id,
      'vendor_verified',
      'Vendor Account Verified',
      'Congratulations! Your store "' || NEW.store_name || '" has been verified.',
      NEW.id,
      '{}'::jsonb
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_vendor_verified_notify
  AFTER UPDATE ON public.vendors
  FOR EACH ROW
  EXECUTE FUNCTION public.on_vendor_verified_notify();

-- Trigger: on review submitted, notify vendor
CREATE OR REPLACE FUNCTION public.on_review_notify_vendor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _vendor_user_id UUID;
  _product_title TEXT;
BEGIN
  SELECT v.user_id, p.title INTO _vendor_user_id, _product_title
  FROM products p
  JOIN vendors v ON v.id = p.vendor_id
  WHERE p.id = NEW.product_id;

  IF _vendor_user_id IS NOT NULL THEN
    PERFORM create_notification(
      _vendor_user_id,
      'review_submitted',
      'New Review',
      'A customer left a ' || NEW.rating || '-star review on "' || COALESCE(_product_title, 'your product') || '"',
      NEW.product_id,
      jsonb_build_object('rating', NEW.rating, 'product_title', _product_title)
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_review_notify_vendor
  AFTER INSERT ON public.reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.on_review_notify_vendor();

-- Drop unused function
DROP FUNCTION IF EXISTS public.on_order_placed_notify();
