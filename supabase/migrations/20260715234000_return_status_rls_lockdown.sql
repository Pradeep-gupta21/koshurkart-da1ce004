-- Lock down direct mutations of return_status on order_items.
--
-- RLS WITH CHECK cannot reference NEW or OLD — those pseudo-records are only
-- available inside trigger functions.  The original policy definitions were
-- therefore invalid and would error at runtime.
--
-- Fix: drop the broken policies and enforce the restriction via a
-- BEFORE UPDATE trigger instead, where NEW and OLD are fully available.
--
-- The vendor-approve-return Edge Function uses the service_role key which
-- executes as the "service_role" Postgres role, bypassing both RLS and this
-- trigger's guard (see role check below).  Standard authenticated / anon
-- clients must never mutate return_status directly.

-- ── Step 1: Ensure RLS is on (no-op if already enabled) ───────────────────
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- ── Step 2: Remove the broken RLS policies ────────────────────────────────
DROP POLICY IF EXISTS "block_return_status_update_authenticated" ON public.order_items;
DROP POLICY IF EXISTS "block_return_status_update_public"        ON public.order_items;

-- ── Step 3: Trigger function ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.prevent_direct_return_status_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER          -- runs with elevated rights so it can always inspect the role
SET search_path = public
AS $$
BEGIN
  -- Only block when return_status actually changes.
  IF NEW.return_status IS DISTINCT FROM OLD.return_status THEN
    -- ONLY allow service_role (Edge Functions using the service key) to bypass.
    -- current_user is a Postgres role-level identity that cannot be spoofed
    -- by client code, unlike session-level GUC settings.
    IF current_user = 'service_role' THEN
      RETURN NEW;
    END IF;

    -- All other callers (authenticated, anon, etc.) are blocked.
    RAISE EXCEPTION
      'Direct mutation of return_status is not allowed. Must use gateway.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

-- ── Step 4: Attach the trigger ────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_prevent_direct_return_status_update ON public.order_items;

CREATE TRIGGER trg_prevent_direct_return_status_update
  BEFORE UPDATE ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_direct_return_status_update();
