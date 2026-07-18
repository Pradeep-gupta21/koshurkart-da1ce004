-- Migration: 20260717000005_lockdown_vendor_return_rpc.sql
-- Restricts execution of vendor_approve_return(uuid, uuid) to service_role only.

REVOKE EXECUTE ON FUNCTION public.vendor_approve_return(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vendor_approve_return(uuid, uuid) TO service_role;
