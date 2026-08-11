-- ============================================================================
-- Migration: 20260728220000_secure_nonce_operation_map.sql
-- Description: Prevent replay poisoning by blocking direct client access to
--              the internal idempotency state table.
-- ============================================================================

-- 1. Enable Row Level Security to trigger default-deny behavior
ALTER TABLE public.nonce_operation_map
ENABLE ROW LEVEL SECURITY;

-- 2. Revoke all default privileges from PUBLIC
REVOKE ALL ON public.nonce_operation_map FROM PUBLIC;

-- 3. Revoke all direct PostgREST access from unauthenticated users
REVOKE ALL ON public.nonce_operation_map FROM anon;

-- 4. Revoke all direct PostgREST access from authenticated clients
REVOKE ALL ON public.nonce_operation_map FROM authenticated;

-- (Zero RLS policies are added, ensuring clients have no access path)
