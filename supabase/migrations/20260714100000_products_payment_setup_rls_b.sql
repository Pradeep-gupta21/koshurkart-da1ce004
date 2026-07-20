-- Add RLS policy to products table: vendors can only INSERT/UPDATE/DELETE if payment_setup_completed = true
-- Migration fixes 3 critical security issues in the original version.

-- First, ensure products table has RLS enabled
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- FIX #1: Dropping pre-existing policies to prevent bypass.
--
-- The initial migration (20260315) created permissive INSERT/UPDATE/DELETE
-- policies on public.products without a payment_setup_completed check.
-- In Postgres, permissive policies combine with OR — so ANY permissive policy
-- that passes will grant access, even if our new policies are more restrictive.
-- We must DROP all pre-existing write policies first, otherwise a vendor
-- without payment setup would still pass via the old policies.
-- The SELECT policy ("Anyone can view products") is intentionally preserved.
-- =============================================================================
DROP POLICY IF EXISTS "Vendor can insert products" ON public.products;
DROP POLICY IF EXISTS "Vendor can update products" ON public.products;
DROP POLICY IF EXISTS "Vendor can delete products" ON public.products;

-- Also drop our own policies for idempotency (safe re-run)
DROP POLICY IF EXISTS "vendors_can_insert_products_only_if_payment_setup_complete" ON public.products;
DROP POLICY IF EXISTS "vendors_can_update_own_products_if_payment_setup_complete" ON public.products;
DROP POLICY IF EXISTS "vendors_can_delete_own_products_if_payment_setup_complete" ON public.products;
DROP POLICY IF EXISTS "admins_can_manage_all_products" ON public.products;

-- =============================================================================
-- FIX #2: Correct vendor-to-auth.users linkage.
--
-- The vendors table links to auth.users via `user_id` (not `auth_user_id`).
-- Schema: vendors.user_id UUID REFERENCES auth.users(id)
-- We use the same EXISTS-based ownership check pattern as the original policies
-- defined in migration 20260315, which is more efficient than a scalar subquery.
-- =============================================================================

-- New policy: vendors can INSERT products only if their payment_setup_completed = true
CREATE POLICY "vendors_can_insert_products_only_if_payment_setup_complete" ON public.products
  FOR INSERT TO authenticated
  WITH CHECK (
    -- Vendor ownership: vendors.user_id links to auth.users.id (not auth_user_id)
    EXISTS (
      SELECT 1 FROM public.vendors
      WHERE id = vendor_id
        AND user_id = auth.uid()
        AND payment_setup_completed = true
    )
  );

-- Vendor can UPDATE only their own products, and only if payment setup complete
CREATE POLICY "vendors_can_update_own_products_if_payment_setup_complete" ON public.products
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.vendors
      WHERE id = vendor_id
        AND user_id = auth.uid()
        AND payment_setup_completed = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.vendors
      WHERE id = vendor_id
        AND user_id = auth.uid()
        AND payment_setup_completed = true
    )
  );

-- Vendor can DELETE only their own products, and only if payment setup complete
CREATE POLICY "vendors_can_delete_own_products_if_payment_setup_complete" ON public.products
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.vendors
      WHERE id = vendor_id
        AND user_id = auth.uid()
        AND payment_setup_completed = true
    )
  );

-- =============================================================================
-- FIX #3: Using same role claim as existing admin policies.
--
-- The entire codebase uses `public.has_role(auth.uid(), 'admin'::app_role)`
-- which is a SECURITY DEFINER function that checks the user_roles table.
-- The original `auth.jwt() ->> 'role' = 'admin'` is WRONG because:
--   a) The app uses a custom app_role enum + user_roles table, not JWT claims.
--   b) auth.jwt() ->> 'role' returns the Supabase default role (e.g. 'authenticated'),
--      NOT the application-level admin role.
-- See: has_role() defined in 20260315, used in 20260712, 20260713, and many others.
-- =============================================================================

-- Allow admins to INSERT/UPDATE/DELETE products without payment setup restriction (for admin testing/support)
CREATE POLICY "admins_can_manage_all_products" ON public.products
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- SELECT policies remain unchanged (vendors can read their own, users can read published)
-- The "Anyone can view products" policy from migration 20260315 is preserved.
