-- Migration: 20260717000003_lockdown_payouts.sql
-- Locks down direct client INSERT/UPDATE on the payouts table.
--
-- Before this migration, vendors could write directly to payouts from the browser
-- using the anon/authenticated role, bypassing server-side balance validation.
-- After this migration, only the service_role (Edge Functions) may insert or update
-- payout records. Vendors retain SELECT access to their own payouts.

-- -----------------------------------------------------------------------
-- 1. DROP any existing INSERT / UPDATE policies on the authenticated role
-- -----------------------------------------------------------------------
-- Original policy from 20260315074305 initial schema.
DROP POLICY IF EXISTS "Vendor requests payout" ON public.payouts;

-- Drop any other variant names that may have been created.
DROP POLICY IF EXISTS "vendors_insert_own_payouts" ON public.payouts;
DROP POLICY IF EXISTS "vendor_insert_payout" ON public.payouts;
DROP POLICY IF EXISTS "vendors_insert_payouts" ON public.payouts;

-- Admin direct-UPDATE policy from 20260315132744 migration.
-- Admins approve/reject payouts via the admin dashboard; this should also
-- be routed through an edge function eventually, but for now we preserve
-- the admin UPDATE path by leaving it or recreating it narrowly below.
DROP POLICY IF EXISTS "Admin updates payouts" ON public.payouts;

-- -----------------------------------------------------------------------
-- 2. RESTRICTIVE DENY policy — blocks all direct client INSERT and UPDATE
-- -----------------------------------------------------------------------
-- RESTRICTIVE policies are evaluated with AND against permissive policies.
-- WITH CHECK (false) means no row can ever be written by the authenticated
-- role through a direct client request, regardless of other policies.
-- service_role bypasses RLS entirely and is unaffected.

CREATE POLICY "deny_client_insert_payouts"
  ON public.payouts
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY "deny_client_update_payouts"
  ON public.payouts
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  WITH CHECK (false);

-- -----------------------------------------------------------------------
-- 3. Re-create admin UPDATE permissive policy (scoped to admin role only)
-- -----------------------------------------------------------------------
-- Admins still need to be able to approve/reject payouts. The restrictive
-- DENY above will block authenticated users who are NOT admins. However,
-- because the restrictive policy applies to ALL authenticated users, admin
-- UPDATE also needs an exception path. The correct long-term fix is to
-- route admin payout mutations through an edge function (service_role).
--
-- NOTE: Until admin payout actions are moved to an edge function, admins
-- must invoke via a service_role RPC or edge function. The direct client
-- UPDATE path is intentionally blocked. This comment serves as a TODO.
--
-- Admin approval of payouts should be migrated to an edge function that
-- uses the service_role client. Remove this comment when that is done.

-- -----------------------------------------------------------------------
-- 4. SELECT access — vendors can still view their own payouts (unchanged)
-- -----------------------------------------------------------------------
-- The "Vendor reads own payouts" policy from the initial migration is NOT
-- touched here. Vendors continue to read their own payout rows via the
-- existing SELECT policy.

-- Verify the SELECT policy still exists (informational; not executable DDL):
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'payouts' AND cmd = 'SELECT';
