-- 1. Add rejection reason column for top-level verification
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS verification_rejection_reason text;

-- 2. Audit log table
CREATE TABLE IF NOT EXISTS public.vendor_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  action text NOT NULL,
  previous_status text,
  new_status text,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendor_audit_log_vendor_id
  ON public.vendor_audit_log(vendor_id, created_at DESC);

ALTER TABLE public.vendor_audit_log ENABLE ROW LEVEL SECURITY;

-- Admin reads all
CREATE POLICY "Admins read all audit entries"
  ON public.vendor_audit_log FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Vendors read own
CREATE POLICY "Vendors read own audit entries"
  ON public.vendor_audit_log FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.vendors v
    WHERE v.id = vendor_audit_log.vendor_id AND v.user_id = auth.uid()
  ));

-- No INSERT/UPDATE/DELETE policies → only the SECURITY DEFINER trigger can write.

-- 3. Trigger function: log admin changes
CREATE OR REPLACE FUNCTION public.on_vendor_admin_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid;
BEGIN
  _actor := auth.uid();
  -- Only log when actor is an admin (skips vendor-self updates and trigger cascades)
  IF _actor IS NULL OR NOT has_role(_actor, 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  -- Verification status change
  IF OLD.verification_status IS DISTINCT FROM NEW.verification_status THEN
    INSERT INTO public.vendor_audit_log(vendor_id, actor_user_id, action, previous_status, new_status, reason)
    VALUES (
      NEW.id, _actor,
      'verification_' || NEW.verification_status,
      OLD.verification_status, NEW.verification_status,
      NEW.verification_rejection_reason
    );
  END IF;

  -- KYC status change
  IF OLD.kyc_status IS DISTINCT FROM NEW.kyc_status THEN
    INSERT INTO public.vendor_audit_log(vendor_id, actor_user_id, action, previous_status, new_status, reason)
    VALUES (
      NEW.id, _actor,
      'kyc_' || NEW.kyc_status,
      OLD.kyc_status, NEW.kyc_status,
      NEW.kyc_rejection_reason
    );
  END IF;

  -- Bank verified change
  IF OLD.bank_verified IS DISTINCT FROM NEW.bank_verified THEN
    INSERT INTO public.vendor_audit_log(vendor_id, actor_user_id, action, previous_status, new_status)
    VALUES (
      NEW.id, _actor,
      CASE WHEN NEW.bank_verified THEN 'bank_verified' ELSE 'bank_unverified' END,
      OLD.bank_verified::text, NEW.bank_verified::text
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vendor_admin_change ON public.vendors;
CREATE TRIGGER trg_vendor_admin_change
  AFTER UPDATE ON public.vendors
  FOR EACH ROW
  EXECUTE FUNCTION public.on_vendor_admin_change();

-- 4. Extend verified-notify to include rejection reason
CREATE OR REPLACE FUNCTION public.on_vendor_verified_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.verification_status IS DISTINCT FROM NEW.verification_status THEN
    IF NEW.verification_status = 'approved' THEN
      PERFORM create_notification(
        NEW.user_id, 'vendor_verified', 'Vendor Account Verified',
        'Congratulations! Your store "' || NEW.store_name || '" has been verified.',
        NEW.id, '{}'::jsonb
      );
    ELSIF NEW.verification_status = 'rejected' THEN
      PERFORM create_notification(
        NEW.user_id, 'vendor_rejected', 'Vendor Application Rejected',
        COALESCE(
          'Your application for "' || NEW.store_name || '" was not approved. Reason: ' || NULLIF(NEW.verification_rejection_reason, ''),
          'Your application for "' || NEW.store_name || '" was not approved. You can update your details and reapply.'
        ),
        NEW.id, '{}'::jsonb
      );
    ELSIF NEW.verification_status = 'suspended' THEN
      PERFORM create_notification(
        NEW.user_id, 'vendor_suspended', 'Vendor Account Suspended',
        COALESCE(
          'Your store "' || NEW.store_name || '" has been suspended. Reason: ' || NULLIF(NEW.verification_rejection_reason, ''),
          'Your store "' || NEW.store_name || '" has been suspended. Contact support for details.'
        ),
        NEW.id, '{}'::jsonb
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;