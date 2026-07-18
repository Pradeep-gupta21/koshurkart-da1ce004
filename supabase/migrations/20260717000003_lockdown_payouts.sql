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

-- debited_at: added here so it can be used for refund checks.
ALTER TABLE public.payouts
  ADD COLUMN IF NOT EXISTS debited_at TIMESTAMPTZ;

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

-- -----------------------------------------------------------------------
-- 5. Admin Payout Mutation
-- -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_payout_status(
  p_payout_id UUID,
  p_new_status TEXT
)
RETURNS public.payouts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payout public.payouts;
  v_old_status text;
BEGIN
  -- ── Authorization ────────────────────────────────────────────────────────
  -- Two valid caller identities:
  --   1. service_role  — Edge Functions calling on behalf of an admin action.
  --      auth.uid() is NULL for service_role, so has_role(NULL,...) would always
  --      return false. The role() check must come first and short-circuit.
  --   2. authenticated admin — browser session with a JWT that is mapped to an
  --      admin row in public.user_roles. Uses the canonical has_role helper that
  --      every other function and RLS policy in this schema uses, NOT raw JWT
  --      claim extraction (which is non-standard and bypasses the roles table).
  IF auth.role() = 'service_role' THEN
    -- Service role is unconditionally trusted; no further check needed.
    NULL;
  ELSIF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Unauthorized: Only admins or service_role can update payout status';
  END IF;

  -- ── Row lock (payout first, vendor second — deadlock-safe ordering) ──────
  -- Matches the lock order in request_payout and rollback_vendor_payout.
  SELECT * INTO v_payout
    FROM public.payouts
   WHERE id = p_payout_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payout not found';
  END IF;

  v_old_status := v_payout.status;

  -- ── Terminal-state immutability guard ────────────────────────────────────
  -- Terminal states (completed, rejected, failed, cancelled) are one-way
  -- streets. A payout that has already settled, been rejected, or been
  -- cancelled must never be mutated again — not even by an admin or
  -- service_role. Allowing re-transitions out of a terminal state could:
  --   • Re-debit a vendor whose balance was already refunded (double-spend).
  --   • Flip a completed payout back to pending, hiding the disbursement.
  --   • Circumvent the shadow ledger which assumes each payout transitions
  --     through states exactly once.
  IF v_old_status IN ('completed', 'rejected', 'failed', 'cancelled') THEN
    RAISE EXCEPTION 'Cannot mutate a payout in a terminal state (current: %)', v_old_status;
  END IF;

  -- ── Explicit Transition Matrix ────────────────────────────────────────────
  IF p_new_status = 'processing' THEN
    IF v_old_status <> 'pending' THEN
      RAISE EXCEPTION 'Invalid payout state transition';
    END IF;
  ELSIF p_new_status = 'completed' THEN
    IF v_old_status <> 'processing' THEN
      RAISE EXCEPTION 'Invalid payout state transition';
    END IF;
  ELSIF p_new_status IN ('rejected', 'cancelled', 'failed') THEN
    IF v_old_status NOT IN ('pending', 'processing') THEN
      RAISE EXCEPTION 'Invalid payout state transition';
    END IF;
  ELSE
    RAISE EXCEPTION 'Invalid payout state transition';
  END IF;

  -- ── Apply the status transition ──────────────────────────────────────────
  UPDATE public.payouts
     SET status = p_new_status,
         updated_at = now()
   WHERE id = p_payout_id
  RETURNING * INTO v_payout;

  -- ── Terminal-state refund ────────────────────────────────────────────────
  -- request_payout debits withdrawable_balance the moment a payout is created
  -- ('pending'). If an admin moves a reserved payout to a failure terminal
  -- state, the debited funds must be credited back or they are orphaned.
  -- The old-status guard above already prevents re-entry from a terminal
  -- state, so this block will execute at most once per payout.
  IF p_new_status IN ('rejected', 'cancelled', 'failed')
     AND v_payout.debited_at IS NOT NULL THEN
    UPDATE public.vendors
       SET withdrawable_balance = COALESCE(withdrawable_balance, 0) + COALESCE(v_payout.amount, 0)
     WHERE id = v_payout.vendor_id;

    -- Shadow ledger: every balance mutation must be mirrored in the same
    -- transaction (see 20260713120000) or reconcile_vendor_ledger drifts.
    INSERT INTO public.vendor_wallet_ledger (vendor_id, type, amount, description)
    VALUES (
      v_payout.vendor_id,
      'payout_refund',
      COALESCE(v_payout.amount, 0),
      'Reserved funds returned: payout ' || p_payout_id::text
        || ' moved from ' || v_old_status || ' to ' || p_new_status || ' by admin'
    );
  END IF;

  RETURN v_payout;
END;
$$;

-- Grant execution to authenticated and service_role
REVOKE EXECUTE ON FUNCTION public.admin_update_payout_status(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_payout_status(UUID, TEXT) TO authenticated, service_role;
