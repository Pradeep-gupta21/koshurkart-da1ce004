
-- Vendors can SELECT orders that contain their items
CREATE POLICY "Vendors can view orders with their items"
ON public.orders FOR SELECT TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM public.order_items oi
    JOIN public.vendors v ON v.id = oi.vendor_id
    WHERE oi.order_id = orders.id AND v.user_id = auth.uid()
  )
);

-- Vendors can UPDATE order_status on orders containing their items
CREATE POLICY "Vendors can update orders with their items"
ON public.orders FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.order_items oi
    JOIN public.vendors v ON v.id = oi.vendor_id
    WHERE oi.order_id = orders.id AND v.user_id = auth.uid()
  )
);

-- Vendors can SELECT order_items for their products
CREATE POLICY "Vendors can view their order items"
ON public.order_items FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.vendors v
    WHERE v.id = order_items.vendor_id AND v.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id AND o.user_id = auth.uid()
  )
);

-- Drop the old restrictive SELECT policies that will conflict
DROP POLICY IF EXISTS "Users read own orders" ON public.orders;
DROP POLICY IF EXISTS "Users read own order items" ON public.order_items;
