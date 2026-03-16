
-- Add reputation columns to vendors
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS trust_score numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_rate numeric DEFAULT 100,
  ADD COLUMN IF NOT EXISTS cancellation_rate numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS return_rate numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS review_rating numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_verified boolean DEFAULT false;

-- Function to recalculate vendor trust score
CREATE OR REPLACE FUNCTION public.recalculate_vendor_trust_score(p_vendor_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _review_rating numeric;
  _delivery_rate numeric;
  _cancellation_rate numeric;
  _return_rate numeric;
  _trust_score numeric;
  _total_orders bigint;
  _delivered bigint;
  _cancelled bigint;
  _returned bigint;
BEGIN
  -- Calculate average review rating from all products of this vendor
  SELECT COALESCE(AVG(r.rating), 0) INTO _review_rating
  FROM reviews r
  JOIN products p ON p.id = r.product_id
  WHERE p.vendor_id = p_vendor_id;

  -- Count order statuses for this vendor's items
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE o.order_status = 'delivered'),
    COUNT(*) FILTER (WHERE o.order_status = 'cancelled'),
    COUNT(*) FILTER (WHERE o.order_status = 'returned')
  INTO _total_orders, _delivered, _cancelled, _returned
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  WHERE oi.vendor_id = p_vendor_id;

  -- Calculate rates (avoid division by zero)
  IF _total_orders > 0 THEN
    _delivery_rate := (_delivered::numeric / _total_orders) * 100;
    _cancellation_rate := (_cancelled::numeric / _total_orders) * 100;
    _return_rate := (_returned::numeric / _total_orders) * 100;
  ELSE
    _delivery_rate := 100;
    _cancellation_rate := 0;
    _return_rate := 0;
  END IF;

  -- Compute trust score
  _trust_score := 0.4 * (_review_rating / 5.0 * 100)
                + 0.3 * _delivery_rate
                + 0.2 * (100 - _return_rate)
                + 0.1 * (100 - _cancellation_rate);

  -- Clamp to 0-100
  _trust_score := GREATEST(0, LEAST(100, _trust_score));

  -- Update vendor
  UPDATE vendors
  SET trust_score = _trust_score,
      delivery_rate = _delivery_rate,
      cancellation_rate = _cancellation_rate,
      return_rate = _return_rate,
      review_rating = _review_rating
  WHERE id = p_vendor_id;
END;
$$;

-- Trigger function: on order status change, recalculate for affected vendors
CREATE OR REPLACE FUNCTION public.on_order_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _vendor_id uuid;
BEGIN
  IF OLD.order_status IS DISTINCT FROM NEW.order_status THEN
    FOR _vendor_id IN
      SELECT DISTINCT oi.vendor_id
      FROM order_items oi
      WHERE oi.order_id = NEW.id AND oi.vendor_id IS NOT NULL
    LOOP
      PERFORM recalculate_vendor_trust_score(_vendor_id);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger function: on review insert, recalculate for the product's vendor
CREATE OR REPLACE FUNCTION public.on_review_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _vendor_id uuid;
BEGIN
  SELECT vendor_id INTO _vendor_id FROM products WHERE id = NEW.product_id;
  IF _vendor_id IS NOT NULL THEN
    PERFORM recalculate_vendor_trust_score(_vendor_id);
  END IF;
  RETURN NEW;
END;
$$;

-- Create triggers
CREATE TRIGGER trg_order_status_change
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.on_order_status_change();

CREATE TRIGGER trg_review_insert
  AFTER INSERT ON public.reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.on_review_insert();
