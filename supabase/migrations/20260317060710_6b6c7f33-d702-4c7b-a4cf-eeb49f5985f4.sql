
-- Add ranking columns to products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sales_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS view_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trending_score numeric DEFAULT 0;

-- Function to get ranked products with composite score
CREATE OR REPLACE FUNCTION public.get_ranked_products(
  p_limit integer DEFAULT 20,
  p_category text DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS TABLE(
  id uuid, vendor_id uuid, store_name text, title text, slug text, description text,
  images text[], price numeric, discount_price numeric, stock integer, reserved_stock integer,
  low_stock_threshold integer, category text, rating numeric, review_count integer,
  is_sponsored boolean, status text, created_at timestamptz, sales_count integer,
  view_count integer, trending_score numeric, rank_score numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    p.id, p.vendor_id, v.store_name, p.title, p.slug, p.description,
    p.images, p.price, p.discount_price, p.stock, p.reserved_stock,
    p.low_stock_threshold, p.category, p.rating, p.review_count,
    p.is_sponsored, p.status, p.created_at, p.sales_count,
    p.view_count, p.trending_score,
    (
      0.35 * LEAST(p.sales_count::numeric / GREATEST((SELECT MAX(sales_count) FROM products WHERE status='active'), 1) * 100, 100)
      + 0.25 * (COALESCE(p.rating, 0) / 5.0 * 100)
      + 0.20 * (CASE WHEN EXISTS (
          SELECT 1 FROM ad_campaigns ac
          WHERE ac.product_id = p.id AND ac.status = 'approved'
            AND ac.start_date <= CURRENT_DATE
            AND (ac.end_date IS NULL OR ac.end_date >= CURRENT_DATE)
        ) THEN 100 ELSE 0 END)
      + 0.20 * GREATEST(0, 100 - EXTRACT(EPOCH FROM (now() - p.created_at)) / 86400.0)
    ) AS rank_score
  FROM products p
  LEFT JOIN vendors v ON v.id = p.vendor_id
  WHERE p.status = 'active'
    AND (p_category IS NULL OR p.category = p_category)
    AND (p_search IS NULL OR p.title ILIKE '%' || p_search || '%')
  ORDER BY rank_score DESC
  LIMIT p_limit;
$$;

-- Function to get trending products (recent sales + views in last 7 days)
CREATE OR REPLACE FUNCTION public.get_trending_products(p_limit integer DEFAULT 8)
RETURNS TABLE(
  id uuid, vendor_id uuid, store_name text, title text, slug text, description text,
  images text[], price numeric, discount_price numeric, stock integer, reserved_stock integer,
  low_stock_threshold integer, category text, rating numeric, review_count integer,
  is_sponsored boolean, status text, created_at timestamptz, sales_count integer,
  view_count integer, trending_score numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    p.id, p.vendor_id, v.store_name, p.title, p.slug, p.description,
    p.images, p.price, p.discount_price, p.stock, p.reserved_stock,
    p.low_stock_threshold, p.category, p.rating, p.review_count,
    p.is_sponsored, p.status, p.created_at, p.sales_count,
    p.view_count, p.trending_score
  FROM products p
  LEFT JOIN vendors v ON v.id = p.vendor_id
  WHERE p.status = 'active'
  ORDER BY p.trending_score DESC, p.sales_count DESC, p.view_count DESC
  LIMIT p_limit;
$$;

-- Function to recalculate trending scores for all products
CREATE OR REPLACE FUNCTION public.calculate_product_scores()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE products p SET
    trending_score = (
      SELECT
        COALESCE(SUM(CASE WHEN ae.event_type = 'purchase' THEN 3 ELSE 0 END), 0)
        + COALESCE(SUM(CASE WHEN ae.event_type = 'product_view' THEN 1 ELSE 0 END), 0)
        + COALESCE(SUM(CASE WHEN ae.event_type = 'add_to_cart' THEN 2 ELSE 0 END), 0)
      FROM analytics_events ae
      WHERE ae.product_id = p.id
        AND ae.created_at > now() - interval '7 days'
    )
  WHERE p.status = 'active';
END;
$$;

-- Update on_order_status_change to also update sales_count
CREATE OR REPLACE FUNCTION public.on_order_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _vendor_id uuid;
  _item record;
BEGIN
  IF OLD.order_status IS DISTINCT FROM NEW.order_status THEN
    -- Update vendor trust scores
    FOR _vendor_id IN
      SELECT DISTINCT oi.vendor_id
      FROM order_items oi
      WHERE oi.order_id = NEW.id AND oi.vendor_id IS NOT NULL
    LOOP
      PERFORM recalculate_vendor_trust_score(_vendor_id);
    END LOOP;

    -- Increment product sales_count when delivered
    IF NEW.order_status = 'delivered' THEN
      FOR _item IN
        SELECT product_id, quantity FROM order_items WHERE order_id = NEW.id AND product_id IS NOT NULL
      LOOP
        UPDATE products SET sales_count = sales_count + _item.quantity WHERE id = _item.product_id;
      END LOOP;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger to increment view_count on product_view analytics event
CREATE OR REPLACE FUNCTION public.on_analytics_event_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.event_type = 'product_view' AND NEW.product_id IS NOT NULL THEN
    UPDATE products SET view_count = view_count + 1 WHERE id = NEW.product_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_analytics_event_insert
  AFTER INSERT ON public.analytics_events
  FOR EACH ROW
  EXECUTE FUNCTION public.on_analytics_event_insert();
