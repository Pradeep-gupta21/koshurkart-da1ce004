-- Migration: 20260718000003_fix_null_balance_coalesce.sql
-- Fix: NULL balance in vendor row causes `balance < p_amount` to evaluate to NULL
-- (neither TRUE nor FALSE), which causes the IF branch to not fire, bypassing the
-- insufficient-balance guard. Wrapping with COALESCE(balance, 0) makes it 0-safe.
--
-- Reproduces original problem:
--   SELECT NULL < 100;  → NULL  (not TRUE)
--   IF NULL < 100 THEN  → branch never fires in PL/pgSQL
--
-- Fix: SELECT COALESCE(withdrawable_balance, 0) INTO v_balance
--   SELECT COALESCE(NULL, 0) < 100;  → TRUE  ✓

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
  --
  -- Fix 8: Use COALESCE(withdrawable_balance, 0) so a NULL balance is treated
  -- as 0. Without COALESCE, `NULL < p_amount` evaluates to NULL in PL/pgSQL
  -- and the IF branch below never fires, bypassing the balance guard entirely.
  SELECT COALESCE(withdrawable_balance, 0)
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
  -- v_balance is guaranteed non-NULL here due to COALESCE above.
  IF p_amount > v_balance THEN
    DELETE FROM public.payouts WHERE id = v_payout_id;
    RAISE EXCEPTION 'Insufficient balance: requested % but only % available (₹% available)',
      p_amount, v_balance, (v_balance / 100)::FLOAT;
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

-- Grants remain unchanged: only service_role may call this function.
REVOKE EXECUTE ON FUNCTION public.request_payout(UUID, NUMERIC, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.request_payout(UUID, NUMERIC, TEXT, UUID)
  TO service_role;
