
-- 1. Return photos: restrict vendor SELECT to photos belonging to their orders
DROP POLICY IF EXISTS "Vendors and admins read return photos" ON storage.objects;

CREATE POLICY "Admins and owning vendors read return photos"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'return-photos'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1
      FROM public.order_items oi
      JOIN public.vendors v ON v.id = oi.vendor_id
      WHERE v.user_id = auth.uid()
        AND storage.objects.name = ANY (oi.return_photos)
    )
  )
);

-- 2. Product images: only vendors can delete, and only within their own folder
DROP POLICY IF EXISTS "Authenticated users can delete own product images" ON storage.objects;

CREATE POLICY "Vendors can delete own product images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'product-images'
  AND (auth.uid())::text = (storage.foldername(name))[1]
  AND EXISTS (SELECT 1 FROM public.vendors v WHERE v.user_id = auth.uid())
);

-- 3. Reviews: hide moderation signals from public/authenticated direct reads
REVOKE SELECT (is_suspicious, flagged_reason) ON public.reviews FROM anon, authenticated;

-- Admin RPC so the moderation UI can still load all data
CREATE OR REPLACE FUNCTION public.list_reviews_admin(_limit integer DEFAULT 200)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  product_id uuid,
  order_id uuid,
  rating integer,
  comment text,
  images text[],
  helpful_count integer,
  is_verified_purchase boolean,
  is_suspicious boolean,
  flagged_reason text,
  moderation_status text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY
    SELECT r.id, r.user_id, r.product_id, r.order_id, r.rating, r.comment,
           r.images, r.helpful_count, r.is_verified_purchase, r.is_suspicious,
           r.flagged_reason, r.moderation_status, r.created_at
    FROM public.reviews r
    ORDER BY r.created_at DESC
    LIMIT _limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_reviews_admin(integer) TO authenticated;
