CREATE TYPE escalation_reason AS ENUM ('insufficient_balance');
CREATE TYPE escalation_status AS ENUM ('open', 'resolved_approved', 'resolved_rejected');

CREATE TABLE payment_escalations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ledger_entry_id UUID REFERENCES ledger_entries(id),
    vendor_id UUID REFERENCES vendors(id),
    reason escalation_reason NOT NULL,
    status escalation_status NOT NULL DEFAULT 'open',
    resolution_notes TEXT,
    resolved_by UUID REFERENCES auth.users(id),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


CREATE OR REPLACE FUNCTION public.prevent_direct_payment_escalation_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- 1. Block all DELETE operations unless service_role
  IF TG_OP = 'DELETE' THEN
    IF current_user = 'service_role' THEN
      RETURN OLD;
    END IF;

    RAISE EXCEPTION
      'Direct deletion of payment_escalations is not allowed. Must use gateway.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 2. Block UPDATE operations on protected fields unless service_role
  IF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.resolved_by IS DISTINCT FROM OLD.resolved_by
       OR NEW.resolved_at IS DISTINCT FROM OLD.resolved_at
       OR NEW.resolution_notes IS DISTINCT FROM OLD.resolution_notes THEN

      -- ONLY allow service_role (Edge Functions using the service key) to bypass.
      IF current_user = 'service_role' THEN
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

CREATE INDEX payment_escalations_vendor_created_idx
ON payment_escalations(vendor_id, created_at);

CREATE INDEX payment_escalations_status_created_idx
ON payment_escalations(status, created_at);

CREATE INDEX payment_escalations_ledger_entry_idx
ON payment_escalations(ledger_entry_id);


CREATE TRIGGER trg_prevent_direct_payment_escalation_update
  BEFORE UPDATE OR DELETE ON public.payment_escalations
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_direct_payment_escalation_update();


