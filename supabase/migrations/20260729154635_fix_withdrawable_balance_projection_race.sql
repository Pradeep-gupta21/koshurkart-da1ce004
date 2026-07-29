-- =============================================================================
-- Migration: 20260729154635_fix_withdrawable_balance_projection_race.sql
-- Description: Fixes an MVCC write skew anomaly in the projection trigger by 
-- serializing concurrent operations using an explicit row lock BEFORE aggregation.
-- Also hardens the trigger to handle DELETEs and vendor_id mutations.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.recalculate_withdrawable_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance numeric;
  v_vendor_id uuid;
BEGIN
  -- Determine which vendors need to be recalculated.
  -- To prevent deadlocks, we lock the vendor rows in deterministic order (by UUID).
  FOR v_vendor_id IN (
    SELECT DISTINCT id 
    FROM (
      SELECT CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN NEW.vendor_id END AS id
      UNION
      SELECT CASE WHEN TG_OP IN ('DELETE', 'UPDATE') THEN OLD.vendor_id END AS id
    ) AS affected
    WHERE id IS NOT NULL
    ORDER BY id
  )
  LOOP
    -- 1. Acquire exclusive lock on the vendor row BEFORE aggregating.
    -- This forces concurrent triggers for the same vendor to serialize here.
    -- When a blocked trigger resumes, it proceeds to the next PL/pgSQL statement
    -- which acquires a fresh MVCC snapshot, guaranteeing it sees previously
    -- committed transactions.
    PERFORM 1 FROM public.vendors WHERE id = v_vendor_id FOR UPDATE;

    -- 2. Execute aggregation with the fresh snapshot
    SELECT COALESCE(
      SUM(
        CASE
          WHEN type IN ('credit', 'refund') AND status = 'confirmed' THEN amount_paise
          WHEN type IN ('debit', 'reservation', 'payout', 'reversal') AND status IN ('pending', 'confirmed') THEN -amount_paise
          ELSE 0
        END
      ), 0
    ) INTO v_new_balance
    FROM public.ledger_entries
    WHERE vendor_id = v_vendor_id;

    -- 3. Update the projection
    UPDATE public.vendors
    SET withdrawable_balance = v_new_balance
    WHERE id = v_vendor_id;
  END LOOP;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

-- Redefine the trigger to fire on DELETE as well to guarantee absolute projection accuracy
DROP TRIGGER IF EXISTS trg_recalculate_withdrawable_balance ON public.ledger_entries;
CREATE TRIGGER trg_recalculate_withdrawable_balance
  AFTER INSERT OR UPDATE OR DELETE ON public.ledger_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.recalculate_withdrawable_balance();
