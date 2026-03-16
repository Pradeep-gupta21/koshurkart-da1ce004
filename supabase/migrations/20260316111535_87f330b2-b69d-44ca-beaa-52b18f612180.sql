-- Admin can delete reviews (moderation)
CREATE POLICY "Admin deletes reviews"
ON public.reviews
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Admin can read order_items for fraud detection
CREATE POLICY "Admin reads all order items"
ON public.order_items
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Admin can read all orders for fraud detection
CREATE POLICY "Admin reads all orders"
ON public.orders
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Detect abnormal purchase patterns: users with >5 orders in 1 hour
CREATE OR REPLACE FUNCTION public.detect_abnormal_purchases()
RETURNS TABLE(user_id uuid, user_email text, user_name text, order_count bigint, window_start timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT o.user_id, p.email, p.name, COUNT(*) as order_count,
         date_trunc('hour', o.created_at) as window_start
  FROM orders o
  JOIN profiles p ON p.id = o.user_id
  WHERE o.created_at > now() - interval '7 days'
  GROUP BY o.user_id, p.email, p.name, date_trunc('hour', o.created_at)
  HAVING COUNT(*) > 5
  ORDER BY order_count DESC
  LIMIT 50;
$$;