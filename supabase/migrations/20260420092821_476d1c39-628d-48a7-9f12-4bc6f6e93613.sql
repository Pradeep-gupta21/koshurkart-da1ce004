CREATE OR REPLACE FUNCTION public.get_local_deals(_pincode text DEFAULT NULL, _limit integer DEFAULT 8)
RETURNS TABLE(
  id uuid,
  vendor_id uuid,
  store_name text,
  title text,
  slug text,
  description text,
  images text[],
  price numeric,
  discount_price numeric,
  stock integer,
  reserved_stock integer,
  low_stock_threshold integer,
  category text,
  rating numeric,
  review_count integer,
  is_sponsored boolean,
  status text,
  created_at timestamp with time zone,
  sales_count integer,
  view_count integer,
  trending_score numeric,
  discount_pct numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id, p.vendor_id, v.store_name, p.title, p.slug, p.description,
    p.images, p.price, p.discount_price, p.stock, p.reserved_stock,
    p.low_stock_threshold, p.category, p.rating, p.review_count,
    p.is_sponsored, p.status, p.created_at, p.sales_count,
    p.view_count, p.trending_score,
    CASE
      WHEN p.discount_price IS NOT NULL AND p.price > 0
        THEN ROUND(((p.price - p.discount_price) / p.price) * 100, 2)
      ELSE 0
    END AS discount_pct
  FROM products p
  LEFT JOIN vendors v ON v.id = p.vendor_id
  WHERE p.status = 'active'
    AND p.discount_price IS NOT NULL
    AND p.discount_price < p.price
    AND (
      _pincode IS NULL
      OR NOT EXISTS (SELECT 1 FROM vendor_serviceability vs WHERE vs.vendor_id = p.vendor_id)
      OR EXISTS (
        SELECT 1 FROM vendor_serviceability vs
        WHERE vs.vendor_id = p.vendor_id
          AND vs.ships = true
          AND _pincode LIKE vs.pincode_pattern
      )
    )
  ORDER BY discount_pct DESC, p.trending_score DESC NULLS LAST
  LIMIT _limit;
$$;