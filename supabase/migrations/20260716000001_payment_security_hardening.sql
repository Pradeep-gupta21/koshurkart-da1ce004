-- =============================================================================
-- Migration: Payment Security Hardening
-- Blocks all client-side writes to payments and vendor_wallet_ledger.
-- All mutations flow through service_role in Edge Functions (bypasses RLS).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- PAYMENTS table
-- -----------------------------------------------------------------------------

-- 1. Drop the permissive policies that allowed users to INSERT/UPDATE payments
--    directly from the client.
DROP POLICY IF EXISTS "Users insert own payments" ON public.payments;
DROP POLICY IF EXISTS "Users update own payments" ON public.payments;

-- 2. Ensure the admin UPDATE policy exists (idempotent: drop then recreate).
DROP POLICY IF EXISTS "Admins can update payments" ON public.payments;

CREATE POLICY "Admins can update payments"
  ON public.payments
  FOR UPDATE
  TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  )
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

-- -----------------------------------------------------------------------------
-- VENDOR_WALLET_LEDGER table
-- Defense-in-depth: authenticated users must NEVER write to this table.
-- All ledger entries are created server-side via service_role.
-- -----------------------------------------------------------------------------

-- Drop any existing deny policies with these names before recreating them.
DROP POLICY IF EXISTS "Deny authenticated insert on vendor_wallet_ledger" ON public.vendor_wallet_ledger;
DROP POLICY IF EXISTS "Deny authenticated update on vendor_wallet_ledger" ON public.vendor_wallet_ledger;
DROP POLICY IF EXISTS "Deny authenticated delete on vendor_wallet_ledger" ON public.vendor_wallet_ledger;

CREATE POLICY "Deny authenticated insert on vendor_wallet_ledger"
  ON public.vendor_wallet_ledger
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY "Deny authenticated update on vendor_wallet_ledger"
  ON public.vendor_wallet_ledger
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY "Deny authenticated delete on vendor_wallet_ledger"
  ON public.vendor_wallet_ledger
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (false);
