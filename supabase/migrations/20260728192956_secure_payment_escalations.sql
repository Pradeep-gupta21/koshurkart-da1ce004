-- Migration: 20260728192956_secure_payment_escalations.sql
-- Description: Enforce strict default-deny Row Level Security on payment_escalations.
--
-- Background:
--   payment_escalations is an internal orchestration table for managing blocked
--   workflow states (e.g., insufficient vendor balances during return reversals).
--   It is exclusively managed by backend logic via SECURITY DEFINER RPCs 
--   (specifically approve_return_intent) and service_role Edge Functions.
--
--   Because there are zero legitimate direct frontend consumers, we enforce
--   a default-deny security model by enabling RLS and creating ZERO policies.
--   We also revoke all direct PostgREST access.
--
-- Why no policies?
--   PostgreSQL's default behavior when RLS is enabled without any policies is to
--   block all access to the table for roles subject to RLS (anon, authenticated).
--   The approve_return_intent RPC is SECURITY DEFINER and inherently bypasses RLS.
--   service_role requests also bypass RLS. Thus, business logic is unaffected.

-- 1. Enable Row Level Security (blocks all access without policies)
ALTER TABLE public.payment_escalations ENABLE ROW LEVEL SECURITY;

-- 2. Revoke all direct PostgREST client execution privileges
REVOKE ALL ON public.payment_escalations FROM PUBLIC;
REVOKE ALL ON public.payment_escalations FROM anon;
REVOKE ALL ON public.payment_escalations FROM authenticated;

-- (Intentionally creating NO policies)
