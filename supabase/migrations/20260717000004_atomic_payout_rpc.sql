-- Migration: 20260717000004_atomic_payout_rpc.sql
-- Closes the TOCTOU race in payout creation; adds idempotency, method IDOR
-- protection, and immediate balance reservation.
--
-- Problem 1 (TOCTOU): Previous two-step SELECT+INSERT idempotency check left a
--   window where two concurrent retries could both observe "key does not exist"
--   and both proceed to insert — the constraint catches the second, but not
--   before both have already read the balance and attempted to deduct.
-- Problem 2 (IDOR): method_id was accepted from the client with no check that
--   it actually belongs to the requesting vendor.
-- Problem 3 (Idempotency): No guard against network retries inserting duplicates.
-- Problem 4 (Reservation): Balance was only debited on payout completion, so the
--   withdrawable_balance stayed inflated between pending and completed states,
--   allowing over-drawing via concurrent requests.
--
-- Fix: single SECURITY DEFINER RPC in one transaction that:
--   1. Issues a single INSERT ... ON CONFLICT (idempotency_key) DO NOTHING
--      RETURNING id, status — the unique constraint is the atomic gate; no
--      TOCTOU window exists between a SELECT and an INSERT.
--   2. If the INSERT returns a row (new request): locks vendor FOR UPDATE,
--      validates balance, verifies method IDOR, reserves funds, stamps debited_at.
--   3. If the INSERT returns nothing (duplicate key): SELECTs the existing row
--      and returns it — safe idempotent response; no balance change.
--   4. Verifies method_id belongs to the vendor — eliminates IDOR.
--   5. Deducts the amount from withdrawable_balance immediately and writes a
--      'payout_reserved' ledger entry — reserve funds on pending, not on complete.

-- -----------------------------------------------------------------------
-- 0. Schema additions
-- -----------------------------------------------------------------------
-- method_id on payouts (nullable; not in original schema).
ALTER TABLE public.payouts
  ADD COLUMN IF NOT EXISTS method_id TEXT;

-- idempotency_key on payouts: unique per key, allows safe client retries.
-- Nullable so un-keyed (legacy) payouts are not broken.
ALTER TABLE public.payouts
  ADD COLUMN IF NOT EXISTS idempotency_key UUID;

-- debited_at: stamped when funds are reserved so the completion trigger can
-- detect that balance was already deducted and skip its own deduction.
ALTER TABLE public.payouts
  ADD COLUMN IF NOT EXISTS debited_at TIMESTAMPTZ;

-- UNIQUE CONSTRAINT on idempotency_key.
--
-- A named UNIQUE constraint (not merely a partial index) is required so that
-- ON CONFLICT (idempotency_key) DO NOTHING can target the constraint cleanly.
-- NULL values in a UNIQUE column are still permitted by the SQL standard
-- (each NULL is considered distinct), so un-keyed payouts are unaffected.
--
-- Drop any pre-existing partial index from an earlier draft of this migration
-- to avoid naming conflicts before adding the constraint.
DROP INDEX IF EXISTS public.payouts_idempotency_key_idx;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.payouts'::regclass
       AND conname  = 'payouts_idempotency_key_key'
       AND contype  = 'u'
  ) THEN
    ALTER TABLE public.payouts
      ADD CONSTRAINT payouts_idempotency_key_key
      UNIQUE (idempotency_key);
  END IF;
END;
$$;

-- -----------------------------------------------------------------------
-- 1. Atomic payout RPC  (renamed: request_payout)
-- -----------------------------------------------------------------------
-- Idempotency protocol (concurrent-safe, zero TOCTOU):
--
--   Step A — Atomic claim:
--     INSERT INTO payouts (...) VALUES (...)
--     ON CONFLICT (idempotency_key) DO NOTHING
--     RETURNING id, status INTO v_payout_id, v_status;
--
--     The INSERT and the conflict check are a single indivisible statement.
--     No two concurrent transactions can both observe "key absent" and
--     both proceed; the constraint serialises them. The losing transaction
--     receives NULL from RETURNING and takes the duplicate path (Step B).
--
--   Step B — Branch on result:
--     v_payout_id IS NOT NULL  →  new request: lock vendor, validate, reserve.
--     v_payout_id IS NULL      →  duplicate:   SELECT existing row, return it.
CREATE OR REPLACE FUNCTION public.request_payout(
  p_vendor_id       UUID,
  p_amount          NUMERIC,
  p_method_id       TEXT    DEFAULT NULL,
  p_idempotency_key UUID    DEFAULT NULL
)
RETURNS SETOF public.payouts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payout_id  UUID;
  v_status     TEXT;
  v_balance    NUMERIC;
  v_payout     public.payouts;
BEGIN
  -- ---- 0. Fast input validation (no row access needed) ----
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Requested amount must be greater than 0';
  END IF;

  -- ---- 1. Atomic idempotency claim ----
  --
  -- When p_idempotency_key IS NOT NULL:
  --   • A single INSERT … ON CONFLICT DO NOTHING atomically claims the key.
  --   • RETURNING captures id/status only when THIS transaction inserts the row.
  --   • If the key already exists the INSERT is silently skipped; RETURNING
  --     yields no rows, so v_payout_id remains NULL → duplicate path below.
  --
  -- When p_idempotency_key IS NULL:
  --   • Each call is independent; no deduplication. NULL != NULL in SQL, so
  --     the UNIQUE constraint is never triggered.
  IF p_idempotency_key IS NOT NULL THEN

    INSERT INTO public.payouts (
      vendor_id, amount, method_id, status, idempotency_key
    )
    VALUES (
      p_vendor_id, p_amount, p_method_id, 'pending', p_idempotency_key
    )
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id, status INTO v_payout_id, v_status;

    -- ---- 2a. Duplicate key path: return the existing record ----
    --
    -- The key was already claimed by a prior (or concurrent-winning) request.
    -- Fetch the persisted row and return it — no balance change.
    IF v_payout_id IS NULL THEN

      SELECT * INTO v_payout
        FROM public.payouts
       WHERE idempotency_key = p_idempotency_key;

      -- Sanity / collision-attack check: parameters must match the original.
      IF p_vendor_id IS DISTINCT FROM v_payout.vendor_id 
         OR p_amount IS DISTINCT FROM v_payout.amount 
         OR p_method_id IS DISTINCT FROM v_payout.method_id THEN
        RAISE EXCEPTION 'Idempotency key collision with mismatched parameters'
          USING HINT = 'vendor_id, amount, or method_id does not match the original request for this key';
      END IF;

      -- Terminal state check: if the prior request failed/cancelled, the key is burned.
      IF v_payout.status IN ('failed', 'cancelled', 'rejected') THEN
        RAISE EXCEPTION 'IDEMPOTENCY_TERMINAL: This key is bound to a failed payout. Generate a fresh idempotency key to try again.';
      END IF;

      RETURN NEXT v_payout;
      RETURN;
    END IF;

  ELSE
    -- No idempotency key: plain insert, no deduplication.
    INSERT INTO public.payouts (
      vendor_id, amount, method_id, status, idempotency_key
    )
    VALUES (
      p_vendor_id, p_amount, p_method_id, 'pending', NULL
    )
    RETURNING id, status INTO v_payout_id, v_status;
  END IF;

  -- -----------------------------------------------------------------------
  -- From here: this transaction holds the newly inserted payout row.
  -- v_payout_id is set. Validate and reserve funds.
  -- -----------------------------------------------------------------------

  -- ---- 3. Lock the vendor row (FOR UPDATE) ----
  --
  -- Acquires an exclusive row lock on the vendor, preventing any concurrent
  -- transaction from modifying withdrawable_balance until we commit.
  -- Ordering note: payout row is inserted first, vendor locked second.
  -- All code paths that touch both tables must follow this order to prevent
  -- deadlocks (consistent lock ordering).
  SELECT withdrawable_balance
    INTO v_balance
    FROM public.vendors
   WHERE id = p_vendor_id
     FOR UPDATE;

  IF NOT FOUND THEN
    -- Vendor does not exist. Clean up the payout placeholder and raise.
    DELETE FROM public.payouts WHERE id = v_payout_id;
    RAISE EXCEPTION 'Vendor not found';
  END IF;

  -- ---- 4. Sufficient balance check ----
  IF p_amount > v_balance THEN
    DELETE FROM public.payouts WHERE id = v_payout_id;
    RAISE EXCEPTION 'Insufficient balance: requested % but only % available',
      p_amount, v_balance;
  END IF;

  -- ---- 5. Method IDOR check ----
  -- Verify the supplied method belongs to this vendor. Without this, a vendor
  -- could supply another vendor's payment method ID and redirect their payout.
  IF p_method_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
        FROM public.vendor_payment_setup
       WHERE vendor_id    = p_vendor_id
         AND id::text     = p_method_id
         AND is_completed = TRUE
    ) THEN
      DELETE FROM public.payouts WHERE id = v_payout_id;
      RAISE EXCEPTION 'Unauthorized payment method';
    END IF;
  END IF;

  -- ---- 6. Reserve funds immediately ----
  --
  -- Deduct from withdrawable_balance on payout creation (pending state), not
  -- on completion. This prevents a second concurrent payout from observing the
  -- un-reserved balance between pending and completed states.
  -- The completion trigger (debit_balance_on_payout_complete) guards with
  -- NEW.debited_at IS NULL and skips the balance UPDATE when debited_at is
  -- already set, preventing double-deduction.
  UPDATE public.vendors
     SET withdrawable_balance = COALESCE(withdrawable_balance, 0) - COALESCE(p_amount, 0)
   WHERE id = p_vendor_id;

  -- Shadow ledger: record the reservation (negative = debit).
  INSERT INTO public.vendor_wallet_ledger (vendor_id, type, amount, description)
  VALUES (
    p_vendor_id,
    'payout_reserved',
    -COALESCE(p_amount, 0),
    'Payout funds reserved (pending payout ' || v_payout_id::text || ')'
  );

  -- ---- 7. Stamp debited_at now that funds are reserved ----
  --
  -- debited_at is set AFTER validation succeeds (not at INSERT time).
  -- If any validation above deleted the row and raised, no phantom timestamp
  -- is persisted. Setting it here signals the completion trigger to skip its
  -- own balance deduction.
  UPDATE public.payouts
     SET debited_at = now()
   WHERE id = v_payout_id
  RETURNING * INTO v_payout;

  RETURN NEXT v_payout;
END;
$$;

-- -----------------------------------------------------------------------
-- 2. Grants
-- -----------------------------------------------------------------------
-- Revoke any previous process_vendor_payout overloads (old function name).
DO $$
BEGIN
  BEGIN
    REVOKE EXECUTE ON FUNCTION public.process_vendor_payout(UUID, NUMERIC, TEXT)
      FROM PUBLIC, anon, authenticated, service_role;
  EXCEPTION
    WHEN undefined_function THEN
      NULL;
  END;

  BEGIN
    REVOKE EXECUTE ON FUNCTION public.process_vendor_payout(UUID, NUMERIC, TEXT, UUID)
      FROM PUBLIC, anon, authenticated, service_role;
  EXCEPTION
    WHEN undefined_function THEN
      NULL;
  END;
END;
$$;
-- Revoke from all roles before granting narrowly to service_role.
REVOKE EXECUTE ON FUNCTION public.request_payout(UUID, NUMERIC, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;

-- Only service_role (Edge Functions) may call this function directly.
GRANT EXECUTE ON FUNCTION public.request_payout(UUID, NUMERIC, TEXT, UUID)
  TO service_role;

-- -----------------------------------------------------------------------
-- 3. Rollback RPC
-- -----------------------------------------------------------------------
-- rollback_vendor_payout(p_payout_id)
--
-- Called by the Edge Function's catch block when the external gateway call
-- (or any post-RPC logic) fails after funds have already been reserved.
-- Atomically:
--   1. Verifies the payout is still in 'pending' state (safe to roll back).
--   2. Marks it 'failed'.
--   3. Credits the reserved amount back to the vendor's withdrawable_balance.
--   4. Writes a 'payout_rollback' ledger entry for auditability.
CREATE OR REPLACE FUNCTION public.rollback_vendor_payout(
  p_payout_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payout public.payouts;
BEGIN
  -- Lock and fetch the payout row in one step.
  SELECT * INTO v_payout
    FROM public.payouts
   WHERE id = p_payout_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payout % not found', p_payout_id;
  END IF;

  -- Only pending payouts can be rolled back. If already failed/completed,
  -- do not touch the balance to avoid double-crediting.
  IF v_payout.status <> 'pending' THEN
    RAISE EXCEPTION 'Cannot rollback payout % with status %',
      p_payout_id, v_payout.status
      USING HINT = 'Only pending payouts can be rolled back';
  END IF;

  -- Mark as failed.
  UPDATE public.payouts
     SET status     = 'failed',
         updated_at = now()
   WHERE id = p_payout_id;

  -- Credit the reserved amount back to the vendor's withdrawable balance.
  UPDATE public.vendors
     SET withdrawable_balance = COALESCE(withdrawable_balance, 0) + COALESCE(v_payout.amount, 0)
   WHERE id = v_payout.vendor_id;

  -- Ledger entry for audit trail (positive = credit).
  INSERT INTO public.vendor_wallet_ledger (vendor_id, type, amount, description)
  VALUES (
    v_payout.vendor_id,
    'payout_rollback',
    v_payout.amount,
    'Payout funds released (gateway failure rollback for payout ' || p_payout_id::text || ')'
  );
END;
$$;

-- Restrict rollback RPC to service_role only (called from Edge Functions).
REVOKE EXECUTE ON FUNCTION public.rollback_vendor_payout(UUID)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.rollback_vendor_payout(UUID)
  TO service_role;
