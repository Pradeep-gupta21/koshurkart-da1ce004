-- ============================================================================
-- Migration: 20260728210000_secure_ledger_entries_rls.sql
-- Description: Secure ledger_entries with Row Level Security.
--
-- Background:
--   The ledger_entries table resides in the public schema but lacks RLS.
--   This migration locks down the table by enabling RLS and explicitly revoking
--   all direct client privileges (anon, authenticated). 
--   
--   Because the financial ledger is strictly an internal implementation detail,
--   all legitimate access occurs via privileged backend execution paths
--   (SECURITY DEFINER RPCs, database triggers, and the service_role client).
--   Therefore, zero RLS policies are created, establishing a strict 
--   default-deny posture for all PostgREST clients.
-- ============================================================================

-- 1. Enable Row Level Security
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;

-- 2. Revoke direct access from client roles
REVOKE ALL ON public.ledger_entries FROM anon;
REVOKE ALL ON public.ledger_entries FROM authenticated;

-- (No policies are created. The table is now inaccessible to anon/authenticated.)
