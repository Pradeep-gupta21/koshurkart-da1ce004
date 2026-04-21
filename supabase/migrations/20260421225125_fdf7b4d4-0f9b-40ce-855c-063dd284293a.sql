-- Drop existing functions whose return shape is changing
DROP FUNCTION IF EXISTS public.get_ranked_products(integer, text, text);
DROP FUNCTION IF EXISTS public.search_products(text, text, numeric, numeric, numeric, text, integer);
DROP FUNCTION IF EXISTS public.get_trending_products(integer);
DROP FUNCTION IF EXISTS public.get_local_deals(text, integer);

-- get_ranked_products with locality boost + pickup_state
CREATE FUNCTION public.get_ranked_products(
  p_limit integer DEFAULT 20,
  p_category text DEFAULT NULL::text,
  p_search text DEFAULT NULL::text,
  p_user_state text DEFAULT NULL::text
)
 RETURNS TABLE(id uuid, vendor_id uuid, store_name text, pickup_state text, title text, slug text, description text, images text[], price numeric, discount_price numeric, stock integer, reserved_stock integer, low_stock_threshold integer, category text, rating numeric, review_count integer, is_sponsored boolean, status text, created_at timestamp with time zone, sales_count integer, view_count integer, trending_score numeric, rank_score numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    p.id, p.vendor_id, v.store_name, v.pickup_state, p.title, p.slug, p.description,
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
      + (CASE WHEN p_user_state IS NOT NULL AND v.pickup_state IS NOT NULL
              AND lower(v.pickup_state) = lower(p_user_state)
            THEN 10 ELSE 0 END)
    ) AS rank_score
  FROM products p
  LEFT JOIN vendors v ON v.id = p.vendor_id
  WHERE p.status = 'active'
    AND (p_category IS NULL OR p.category = p_category)
    AND (p_search IS NULL OR p.title ILIKE '%' || p_search || '%')
  ORDER BY rank_score DESC
  LIMIT p_limit;
$function$;

-- search_products with locality boost + pickup_state
CREATE FUNCTION public.search_products(
  p_query text DEFAULT NULL::text,
  p_category text DEFAULT NULL::text,
  p_min_price numeric DEFAULT NULL::numeric,
  p_max_price numeric DEFAULT NULL::numeric,
  p_min_rating numeric DEFAULT NULL::numeric,
  p_sort text DEFAULT 'relevance'::text,
  p_limit integer DEFAULT 30,
  p_user_state text DEFAULT NULL::text
)
 RETURNS TABLE(id uuid, vendor_id uuid, store_name text, pickup_state text, title text, slug text, description text, images text[], price numeric, discount_price numeric, stock integer, reserved_stock integer, low_stock_threshold integer, category text, rating numeric, review_count integer, is_sponsored boolean, status text, created_at timestamp with time zone, sales_count integer, view_count integer, trending_score numeric, tags text[], relevance_score real)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    p.id, p.vendor_id, v.store_name, v.pickup_state, p.title, p.slug, p.description,
    p.images, p.price, p.discount_price, p.stock, p.reserved_stock,
    p.low_stock_threshold, p.category, p.rating, p.review_count,
    p.is_sponsored, p.status, p.created_at, p.sales_count,
    p.view_count, p.trending_score, p.tags,
    (
      CASE
        WHEN p_query IS NOT NULL AND p_query != '' THEN
          ts_rank(p.search_vector, websearch_to_tsquery('english', p_query))
        ELSE 0
      END
      + (CASE WHEN p_user_state IS NOT NULL AND v.pickup_state IS NOT NULL
              AND lower(v.pickup_state) = lower(p_user_state)
            THEN 0.10 ELSE 0 END)
    )::real AS relevance_score
  FROM products p
  LEFT JOIN vendors v ON v.id = p.vendor_id
  WHERE p.status = 'active'
    AND (p_query IS NULL OR p_query = '' OR p.search_vector @@ websearch_to_tsquery('english', p_query)
         OR p.title ILIKE '%' || p_query || '%')
    AND (p_category IS NULL OR p.category = p_category)
    AND (p_min_price IS NULL OR COALESCE(p.discount_price, p.price) >= p_min_price)
    AND (p_max_price IS NULL OR COALESCE(p.discount_price, p.price) <= p_max_price)
    AND (p_min_rating IS NULL OR COALESCE(p.rating, 0) >= p_min_rating)
  ORDER BY
    CASE WHEN p_sort = 'relevance' THEN
      (CASE
        WHEN p_query IS NOT NULL AND p_query != '' THEN
          ts_rank(p.search_vector, websearch_to_tsquery('english', p_query))
        ELSE 0
      END
      + (CASE WHEN p_user_state IS NOT NULL AND v.pickup_state IS NOT NULL
              AND lower(v.pickup_state) = lower(p_user_state)
            THEN 0.10 ELSE 0 END))
    END DESC NULLS LAST,
    CASE WHEN p_sort = 'price-low' THEN COALESCE(p.discount_price, p.price) END ASC NULLS LAST,
    CASE WHEN p_sort = 'price-high' THEN COALESCE(p.discount_price, p.price) END DESC NULLS LAST,
    CASE WHEN p_sort = 'rating' THEN p.rating END DESC NULLS LAST,
    CASE WHEN p_sort = 'popularity' THEN p.sales_count END DESC NULLS LAST,
    CASE WHEN p_sort = 'newest' THEN p.created_at END DESC NULLS LAST,
    p.trending_score DESC NULLS LAST
  LIMIT p_limit;
$function$;

-- get_trending_products with pickup_state
CREATE FUNCTION public.get_trending_products(p_limit integer DEFAULT 8)
 RETURNS TABLE(id uuid, vendor_id uuid, store_name text, pickup_state text, title text, slug text, description text, images text[], price numeric, discount_price numeric, stock integer, reserved_stock integer, low_stock_threshold integer, category text, rating numeric, review_count integer, is_sponsored boolean, status text, created_at timestamp with time zone, sales_count integer, view_count integer, trending_score numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    p.id, p.vendor_id, v.store_name, v.pickup_state, p.title, p.slug, p.description,
    p.images, p.price, p.discount_price, p.stock, p.reserved_stock,
    p.low_stock_threshold, p.category, p.rating, p.review_count,
    p.is_sponsored, p.status, p.created_at, p.sales_count,
    p.view_count, p.trending_score
  FROM products p
  LEFT JOIN vendors v ON v.id = p.vendor_id
  WHERE p.status = 'active'
  ORDER BY p.trending_score DESC, p.sales_count DESC, p.view_count DESC
  LIMIT p_limit;
$function$;

-- get_local_deals with pickup_state
CREATE FUNCTION public.get_local_deals(_pincode text DEFAULT NULL::text, _limit integer DEFAULT 8)
 RETURNS TABLE(id uuid, vendor_id uuid, store_name text, pickup_state text, title text, slug text, description text, images text[], price numeric, discount_price numeric, stock integer, reserved_stock integer, low_stock_threshold integer, category text, rating numeric, review_count integer, is_sponsored boolean, status text, created_at timestamp with time zone, sales_count integer, view_count integer, trending_score numeric, discount_pct numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    p.id, p.vendor_id, v.store_name, v.pickup_state, p.title, p.slug, p.description,
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
$function$;