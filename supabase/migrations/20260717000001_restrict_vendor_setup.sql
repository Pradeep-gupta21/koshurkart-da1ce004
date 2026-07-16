-- =============================================================================
-- Migration: Restrict vendor_payment_setup direct client writes
-- Replaces the permissive INSERT/UPDATE policies from 20260714_vendor_payment_setup
-- with RESTRICTIVE policies that unconditionally deny authenticated client writes.
-- All writes must go through the upsert_vendor_payment_setup_atomic RPC
-- (SECURITY DEFINER, service_role).
-- =============================================================================

-- Drop the original permissive write policies defined in the setup migration.
DROP POLICY IF EXISTS "vendors_insert_own_setup" ON public.vendor_payment_setup;
DROP POLICY IF EXISTS "vendors_update_own_setup"  ON public.vendor_payment_setup;

-- Also drop the admin update policy — admin writes go through service_role
-- which bypasses RLS entirely; the policy is therefore redundant and misleading.
DROP POLICY IF EXISTS "admins_update_all_setup" ON public.vendor_payment_setup;

-- Revoke INSERT/UPDATE table privileges from authenticated — the RESTRICTIVE
-- policies below are the authoritative gate, but removing the grant adds a
-- second layer of defence.
REVOKE INSERT, UPDATE ON public.vendor_payment_setup FROM authenticated;

-- RESTRICTIVE policy: unconditionally deny all direct INSERTs by authenticated clients.
-- RESTRICTIVE policies are ANDed with every permissive policy, so this veto
-- cannot be overridden by any future permissive policy addition.
CREATE POLICY "vendors_insert_own_setup" ON public.vendor_payment_setup
  AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (false);

-- RESTRICTIVE policy: unconditionally deny all direct UPDATEs by authenticated clients.
CREATE POLICY "vendors_update_own_setup" ON public.vendor_payment_setup
  AS RESTRICTIVE
  FOR UPDATE TO authenticated
  WITH CHECK (false);
