

## Fix: Infinite Recursion in Orders RLS Policy

### Root Cause

The `orders` SELECT policy references `order_items`, and the `order_items` SELECT policy references `orders` — creating a circular dependency that Postgres detects as infinite recursion.

Specifically:
- **orders SELECT**: `... OR EXISTS (SELECT 1 FROM order_items oi JOIN vendors v ON v.id = oi.vendor_id WHERE oi.order_id = orders.id ...)`
- **order_items SELECT**: `... OR EXISTS (SELECT 1 FROM orders o WHERE o.id = order_items.order_id AND o.user_id = auth.uid())`

When inserting an order, the SELECT policy evaluates, which queries order_items, which triggers order_items' SELECT policy, which queries orders again — infinite loop.

### Fix

Create two security definer functions to break the circular RLS dependency:

1. **`is_order_owner(order_id, user_id)`** — checks if user owns the order (used by order_items policy instead of querying orders directly)
2. **`is_vendor_order(order_id, user_id)`** — checks if user is a vendor with items in the order (used by orders policy instead of querying order_items directly)

Then drop and recreate the problematic RLS policies to use these functions.

### Migration SQL

```sql
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
DROP POLICY "Vendors can view orders with their items" ON orders;
CREATE POLICY "Vendors can view orders with their items" ON orders FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR is_vendor_order(id, auth.uid()));

-- Fix orders UPDATE policy
DROP POLICY "Vendors can update orders with their items" ON orders;
CREATE POLICY "Vendors can update orders with their items" ON orders FOR UPDATE TO authenticated
  USING (is_vendor_order(id, auth.uid()));

-- Fix order_items SELECT policy
DROP POLICY "Vendors can view their order items" ON order_items;
CREATE POLICY "Vendors can view their order items" ON order_items FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM vendors v WHERE v.id = order_items.vendor_id AND v.user_id = auth.uid())
    OR is_order_owner(order_id, auth.uid())
  );

-- Fix order_items INSERT policy
DROP POLICY "Users insert order items" ON order_items;
CREATE POLICY "Users insert order items" ON order_items FOR INSERT TO authenticated
  WITH CHECK (is_order_owner(order_id, auth.uid()));
```

### Files
- **Migration only** — no code changes needed

