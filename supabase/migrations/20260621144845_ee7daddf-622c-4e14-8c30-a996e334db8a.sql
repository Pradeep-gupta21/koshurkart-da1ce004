
-- 1) Remove vendor SELECT access to full orders PII; users still see own; admins still see all.
DROP POLICY IF EXISTS "Vendors can view orders with their items" ON public.orders;

CREATE POLICY "Users view own orders"
ON public.orders
FOR SELECT
USING (auth.uid() = user_id);

-- 2) SECURITY DEFINER RPC for vendor order list (no customer PII).
CREATE OR REPLACE FUNCTION public.get_vendor_order_items_summary(_vendor_id uuid)
RETURNS TABLE (
  item_id uuid,
  order_id uuid,
  product_id uuid,
  title text,
  image text,
  price numeric,
  quantity integer,
  return_status text,
  return_reason text,
  return_description text,
  return_requested_at timestamptz,
  order_created_at timestamptz,
  order_status text,
  payment_status text,
  total_amount numeric,
  shipping_provider text,
  tracking_id text,
  shipping_status text,
  estimated_delivery timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    oi.id AS item_id,
    oi.order_id,
    oi.product_id,
    oi.title,
    oi.image,
    oi.price,
    oi.quantity,
    oi.return_status::text,
    oi.return_reason,
    oi.return_description,
    oi.return_requested_at,
    o.created_at AS order_created_at,
    o.order_status::text,
    o.payment_status::text,
    o.total_amount,
    o.shipping_provider,
    o.tracking_id,
    o.shipping_status::text,
    o.estimated_delivery
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  JOIN public.vendors v ON v.id = _vendor_id
  WHERE oi.vendor_id = _vendor_id
    AND v.user_id = auth.uid()
  ORDER BY oi.id DESC;
$$;

REVOKE ALL ON FUNCTION public.get_vendor_order_items_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_vendor_order_items_summary(uuid) TO authenticated;

-- 3) Storage: require vendors row for UPDATE on product-images, matching INSERT/DELETE policies.
DROP POLICY IF EXISTS "Vendors can update own product images" ON storage.objects;
CREATE POLICY "Vendors can update own product images"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'product-images'
  AND (auth.uid())::text = (storage.foldername(name))[1]
  AND EXISTS (SELECT 1 FROM public.vendors v WHERE v.user_id = auth.uid())
)
WITH CHECK (
  bucket_id = 'product-images'
  AND (auth.uid())::text = (storage.foldername(name))[1]
  AND EXISTS (SELECT 1 FROM public.vendors v WHERE v.user_id = auth.uid())
);

-- 4) Stop broadcasting fraud-detection data via Realtime to all authenticated subscribers.
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime
      DROP TABLE public.suspicious_clicks;
  EXCEPTION
    WHEN invalid_parameter_value THEN
      -- Table is not a member of the publication.
      NULL;
  END;
END;
$$;
