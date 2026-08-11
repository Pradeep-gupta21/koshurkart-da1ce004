-- =============================================================================
-- Migration: Secure upsert_vendor_payment_setup_atomic
-- Purpose: Revokes default PUBLIC execution privileges from the SECURITY DEFINER 
-- function to prevent privilege escalation by unauthorized direct clients.
-- =============================================================================

-- Revoke from all default roles
REVOKE EXECUTE
ON FUNCTION public.upsert_vendor_payment_setup_atomic(
  uuid, text, text, text, text, text
) FROM PUBLIC;

REVOKE EXECUTE
ON FUNCTION public.upsert_vendor_payment_setup_atomic(
  uuid, text, text, text, text, text
) FROM anon, authenticated;

-- Explicitly grant exclusively to service_role (used by Edge Functions)
GRANT EXECUTE
ON FUNCTION public.upsert_vendor_payment_setup_atomic(
  uuid, text, text, text, text, text
) TO service_role;
