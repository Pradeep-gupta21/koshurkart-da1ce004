-- Phase 4 Task 4.3 Issue 2: Robust Trigger Authorization
-- Fix return_status trigger to correctly verify the origin identity.
-- Since our canonical RPCs (vendor_reject_return, create_return_request)
-- are SECURITY DEFINER, they execute as 'postgres'.
-- Relying on 'current_user = postgres' is brittle and overly broad.
-- We verify via PostgREST's injected JWT claims or the native role context.

CREATE OR REPLACE FUNCTION public.prevent_direct_return_status_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Only block when return_status actually changes.
  IF NEW.return_status IS DISTINCT FROM OLD.return_status THEN
    
    -- Robust authorization:
    -- 1. Direct Edge Function invocation (jwt role = service_role)
    -- 2. Fallback native connection (current_user = service_role or supabase_admin)
    IF (current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role') OR (current_user IN ('service_role', 'supabase_admin')) THEN
      RETURN NEW;
    END IF;

    -- All other callers (authenticated, anon, etc.) are blocked.
    RAISE EXCEPTION
      'Direct mutation of return_status is not allowed. Must use gateway.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$function$;
