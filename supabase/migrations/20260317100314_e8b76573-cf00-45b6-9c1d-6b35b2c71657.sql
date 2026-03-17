
-- Add plain tsvector column (not generated)
ALTER TABLE products ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Create immutable function to update search_vector via trigger
CREATE OR REPLACE FUNCTION public.products_search_vector_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.category, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(array_to_string(NEW.tags, ' '), '')), 'C');
  RETURN NEW;
END;
$$;

-- Trigger to keep search_vector in sync
CREATE TRIGGER trg_products_search_vector
  BEFORE INSERT OR UPDATE OF title, description, category, tags
  ON products
  FOR EACH ROW
  EXECUTE FUNCTION products_search_vector_update();

-- Backfill existing products
UPDATE products SET search_vector =
  setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(category, '')), 'C') ||
  setweight(to_tsvector('english', coalesce(array_to_string(tags, ' '), '')), 'C');

-- GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS idx_products_search ON products USING GIN (search_vector);

-- RPC: search_products with full-text search, filters, and sorting
CREATE OR REPLACE FUNCTION public.search_products(
  p_query text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_min_price numeric DEFAULT NULL,
  p_max_price numeric DEFAULT NULL,
  p_min_rating numeric DEFAULT NULL,
  p_sort text DEFAULT 'relevance',
  p_limit integer DEFAULT 30
)
RETURNS TABLE (
  id uuid, vendor_id uuid, store_name text, title text, slug text,
  description text, images text[], price numeric, discount_price numeric,
  stock integer, reserved_stock integer, low_stock_threshold integer,
  category text, rating numeric, review_count integer, is_sponsored boolean,
  status text, created_at timestamptz, sales_count integer, view_count integer,
  trending_score numeric, tags text[], relevance_score real
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT
    p.id, p.vendor_id, v.store_name, p.title, p.slug, p.description,
    p.images, p.price, p.discount_price, p.stock, p.reserved_stock,
    p.low_stock_threshold, p.category, p.rating, p.review_count,
    p.is_sponsored, p.status, p.created_at, p.sales_count,
    p.view_count, p.trending_score, p.tags,
    CASE
      WHEN p_query IS NOT NULL AND p_query != '' THEN
        ts_rank(p.search_vector, websearch_to_tsquery('english', p_query))
      ELSE 0
    END AS relevance_score
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
    CASE WHEN p_sort = 'relevance' AND p_query IS NOT NULL AND p_query != '' THEN
      ts_rank(p.search_vector, websearch_to_tsquery('english', p_query)) END DESC NULLS LAST,
    CASE WHEN p_sort = 'price-low' THEN COALESCE(p.discount_price, p.price) END ASC NULLS LAST,
    CASE WHEN p_sort = 'price-high' THEN COALESCE(p.discount_price, p.price) END DESC NULLS LAST,
    CASE WHEN p_sort = 'rating' THEN p.rating END DESC NULLS LAST,
    CASE WHEN p_sort = 'popularity' THEN p.sales_count END DESC NULLS LAST,
    CASE WHEN p_sort = 'newest' THEN p.created_at END DESC NULLS LAST,
    p.trending_score DESC NULLS LAST
  LIMIT p_limit;
$$;

-- RPC: get_search_suggestions for autocomplete
CREATE OR REPLACE FUNCTION public.get_search_suggestions(p_query text, p_limit integer DEFAULT 8)
RETURNS TABLE (suggestion text, suggestion_type text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT DISTINCT title AS suggestion, 'product' AS suggestion_type
  FROM products
  WHERE status = 'active'
    AND (search_vector @@ websearch_to_tsquery('english', p_query) OR title ILIKE '%' || p_query || '%')
  ORDER BY suggestion
  LIMIT p_limit;
$$;
