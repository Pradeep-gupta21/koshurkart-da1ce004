-- =============================================================================
-- Migration: Fix return_status trigger execution context
--
-- Bug: The trigger function in 20260715234000_return_status_rls_lockdown.sql
-- was defined as SECURITY DEFINER, which causes Postgres to switch the
-- execution context to the function owner (typically 'postgres' or the
-- migration role) before the body runs. As a result, current_user evaluates
-- to that owner role — never 'service_role' — so the bypass guard:
--
--   IF current_user = 'service_role' THEN RETURN NEW; END IF;
--
-- is permanently dead code, and all service_role mutations (Edge Functions)
-- are incorrectly blocked.
--
-- Fix: Redefine the function as SECURITY INVOKER. The trigger then runs in
-- the context of the session that fired it, so current_user correctly
-- evaluates to 'service_role' when called from an Edge Function using the
-- service key, and to 'authenticated' (or 'anon') for direct client calls.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.prevent_direct_return_status_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER         -- runs as the calling role so current_user is accurate
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
