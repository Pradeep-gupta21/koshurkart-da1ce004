
-- Function: check if user owns order (bypasses RLS)
CREATE OR REPLACE FUNCTION public.is_order_owner(_order_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM orders WHERE id = _order_id AND user_id = _user_id);
$$;

-- Function: check if user is vendor on order (bypasses RLS)
CREATE OR REPLACE FUNCTION public.is_vendor_order(_order_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM order_items oi JOIN vendors v ON v.id = oi.vendor_id
    WHERE oi.order_id = _order_id AND v.user_id = _user_id
  );
$$;

-- Fix orders SELECT policy
DROP POLICY IF EXISTS "Vendors can view orders with their items" ON orders;
CREATE POLICY "Vendors can view orders with their items" ON orders FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR is_vendor_order(id, auth.uid()));

-- Fix orders UPDATE policy
DROP POLICY IF EXISTS "Vendors can update orders with their items" ON orders;
CREATE POLICY "Vendors can update orders with their items" ON orders FOR UPDATE TO authenticated
  USING (is_vendor_order(id, auth.uid()));

-- Fix order_items SELECT policy
DROP POLICY IF EXISTS "Vendors can view their order items" ON order_items;
CREATE POLICY "Vendors can view their order items" ON order_items FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM vendors v WHERE v.id = order_items.vendor_id AND v.user_id = auth.uid())
    OR is_order_owner(order_id, auth.uid())
  );

-- Fix order_items INSERT policy
DROP POLICY IF EXISTS "Users insert order items" ON order_items;
CREATE POLICY "Users insert order items" ON order_items FOR INSERT TO authenticated
  WITH CHECK (is_order_owner(order_id, auth.uid()));
