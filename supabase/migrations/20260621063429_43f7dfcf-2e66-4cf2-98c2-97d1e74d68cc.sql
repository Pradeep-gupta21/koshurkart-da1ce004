
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS return_status TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS return_reason TEXT,
  ADD COLUMN IF NOT EXISTS return_description TEXT,
  ADD COLUMN IF NOT EXISTS return_photos TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS return_requested_at TIMESTAMPTZ;

ALTER TABLE public.order_items
  DROP CONSTRAINT IF EXISTS order_items_return_status_check;
ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_return_status_check
  CHECK (return_status IN ('none','requested','approved','rejected','refunded'));

DROP POLICY IF EXISTS "Customers can request returns on their items" ON public.order_items;
CREATE POLICY "Customers can request returns on their items"
ON public.order_items
FOR UPDATE
TO authenticated
USING (is_order_owner(order_id, auth.uid()))
WITH CHECK (is_order_owner(order_id, auth.uid()));

DROP POLICY IF EXISTS "Users upload own return photos" ON storage.objects;
CREATE POLICY "Users upload own return photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'return-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users read own return photos" ON storage.objects;
CREATE POLICY "Users read own return photos"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'return-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Vendors and admins read return photos" ON storage.objects;
CREATE POLICY "Vendors and admins read return photos"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'return-photos' AND (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'vendor'::app_role)
  )
);
