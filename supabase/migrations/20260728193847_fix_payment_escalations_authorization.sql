-- =============================================================================
-- Migration: 20260728193847_fix_payment_escalations_authorization.sql
-- Description: Replace fragile current_user authorization checks with a robust
-- composite primitive that safely permits both JWT-backed Edge Functions crossing
-- SECURITY DEFINER boundaries and native PostgreSQL administrative execution.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.prevent_direct_payment_escalation_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- 1. Block all DELETE operations unless authorized backend execution
  IF TG_OP = 'DELETE' THEN
    -- Composite check:
    --   - auth.role() = 'service_role' safely permits JWT-backed Edge Functions,
    --     even if executed inside a SECURITY DEFINER context.
    --   - current_user IN ('service_role', 'postgres', 'supabase_admin') safely
    --     permits native PostgreSQL administrative execution lacking JWT claims.
    IF auth.role() = 'service_role' OR current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
      RETURN OLD;
    END IF;

    RAISE EXCEPTION
      'Direct deletion of payment_escalations is not allowed. Must use gateway.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 2. Block UPDATE operations on protected fields unless authorized backend execution
  IF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.resolved_by IS DISTINCT FROM OLD.resolved_by
       OR NEW.resolved_at IS DISTINCT FROM OLD.resolved_at
       OR NEW.resolution_notes IS DISTINCT FROM OLD.resolution_notes THEN

      -- Composite check:
      --   - auth.role() = 'service_role' safely permits JWT-backed Edge Functions,
      --     even if executed inside a SECURITY DEFINER context.
      --   - current_user IN ('service_role', 'postgres', 'supabase_admin') safely
      --     permits native PostgreSQL administrative execution lacking JWT claims.
      IF auth.role() = 'service_role' OR current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
        RETURN NEW;
      END IF;

      RAISE EXCEPTION
        'Direct mutation of payment_escalations is not allowed. Must use gateway.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
