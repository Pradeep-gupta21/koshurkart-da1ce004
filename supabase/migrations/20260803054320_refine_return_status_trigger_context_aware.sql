-- Phase 4 Task 4.3 — Refined Trigger Authorization (Context-Aware Zero-Trust)
--
-- Problem: The previous implementation whitelisted ('service_role', 'supabase_admin')
-- in current_user, but excluded 'postgres'. This correctly blocked API-layer bypasses
-- via SECURITY DEFINER RPCs, but also blocked all legitimate native execution paths
-- (migrations, psql, pg_cron, admin repair scripts) that run as postgres with no
-- PostgREST session in scope — i.e., request.jwt.claims is NULL/empty.
--
-- Fix: Cache request.jwt.claims once into a local variable. Use COALESCE(v_jwt_claims, '')
-- to distinguish native context (empty) from HTTP context (non-empty), then apply the
-- appropriate authorization rule per context.
--
-- Security invariant preserved:
--   NATIVE  → request.jwt.claims is NULL/empty → trust 'postgres', 'service_role', 'supabase_admin'
--   HTTP    → request.jwt.claims is non-empty  → IGNORE current_user entirely
--             (SECURITY DEFINER makes it 'postgres' regardless of actual caller)
--             Enforce jwt_role = 'service_role' only.
--
-- Regression proof:
--   Malicious path: authenticated user → SECURITY DEFINER RPC → postgres (current_user)
--     claims = '{"role":"authenticated"}' (non-empty) → enters HTTP branch → jwt_role ≠ service_role → BLOCKED ✓
--   Legitimate HTTP path: service_role Edge Function → SECURITY DEFINER RPC → postgres (current_user)
--     claims = '{"role":"service_role"}' (non-empty) → enters HTTP branch → jwt_role = service_role → ALLOWED ✓
--   Legitimate native path: psql / migration / pg_cron → postgres (current_user)
--     claims = NULL/'' (empty) → enters NATIVE branch → current_user = postgres → ALLOWED ✓

CREATE OR REPLACE FUNCTION public.prevent_direct_return_status_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
    -- Cache request.jwt.claims exactly once to avoid repeated GUC lookups.
    v_jwt_claims TEXT;
    v_jwt_role   TEXT;
BEGIN
    -- Only enforce when return_status actually changes.
    IF NEW.return_status IS NOT DISTINCT FROM OLD.return_status THEN
        RETURN NEW;
    END IF;

    -- Read the raw JWT claims string once. Returns NULL if not set.
    v_jwt_claims := current_setting('request.jwt.claims', true);

    IF COALESCE(v_jwt_claims, '') = '' THEN
        -- ----------------------------------------------------------------
        -- NATIVE execution context: psql, pg_cron, supabase migration CLI,
        -- admin repair scripts. No PostgREST session — no JWT present.
        -- Trust the native database superusers only.
        -- ----------------------------------------------------------------
        IF current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
            RETURN NEW;
        END IF;

    ELSE
        -- ----------------------------------------------------------------
        -- HTTP / API execution context: PostgREST injected a JWT.
        -- current_user is UNRELIABLE here — SECURITY DEFINER RPCs run as
        -- 'postgres' even when invoked by an 'authenticated' caller.
        -- Enforce strictly on the JWT role claim only.
        -- ----------------------------------------------------------------
        v_jwt_role := (v_jwt_claims::jsonb)->>'role';

        IF v_jwt_role = 'service_role' THEN
            RETURN NEW;
        END IF;

    END IF;

    -- All other callers in both contexts are blocked.
    RAISE EXCEPTION
        'Direct mutation of return_status is not allowed. Must use the authenticated Edge Function gateway.'
        USING ERRCODE = 'insufficient_privilege';
END;
$function$;

COMMENT ON FUNCTION public.prevent_direct_return_status_update() IS
    'Context-aware Zero-Trust trigger. '
    'Native context (NULL JWT): allows postgres/service_role/supabase_admin. '
    'HTTP context (JWT present): allows service_role JWT only — ignores current_user '
    'to prevent SECURITY DEFINER bypass attacks.';
