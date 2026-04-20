
-- 1. Add KYC columns to vendors
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS business_name text,
  ADD COLUMN IF NOT EXISTS business_type text,
  ADD COLUMN IF NOT EXISTS gstin text,
  ADD COLUMN IF NOT EXISTS pan_number text,
  ADD COLUMN IF NOT EXISTS aadhaar_last4 text,
  ADD COLUMN IF NOT EXISTS bank_account_holder text,
  ADD COLUMN IF NOT EXISTS bank_account_number_masked text,
  ADD COLUMN IF NOT EXISTS bank_ifsc text,
  ADD COLUMN IF NOT EXISTS kyc_status text NOT NULL DEFAULT 'not_submitted',
  ADD COLUMN IF NOT EXISTS kyc_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS kyc_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS kyc_rejection_reason text,
  ADD COLUMN IF NOT EXISTS kyc_doc_pan text,
  ADD COLUMN IF NOT EXISTS kyc_doc_address text,
  ADD COLUMN IF NOT EXISTS kyc_doc_business text;

-- 2. KYC field format validation trigger
CREATE OR REPLACE FUNCTION public.validate_vendor_kyc_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.pan_number IS NOT NULL AND NEW.pan_number !~ '^[A-Z]{5}[0-9]{4}[A-Z]$' THEN
    RAISE EXCEPTION 'Invalid PAN format';
  END IF;
  IF NEW.gstin IS NOT NULL AND NEW.gstin <> '' AND NEW.gstin !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[0-9A-Z]{1}Z[0-9A-Z]{1}$' THEN
    RAISE EXCEPTION 'Invalid GSTIN format';
  END IF;
  IF NEW.bank_ifsc IS NOT NULL AND NEW.bank_ifsc !~ '^[A-Z]{4}0[A-Z0-9]{6}$' THEN
    RAISE EXCEPTION 'Invalid IFSC format';
  END IF;
  IF NEW.aadhaar_last4 IS NOT NULL AND NEW.aadhaar_last4 !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'Aadhaar last 4 must be 4 digits';
  END IF;
  IF NEW.kyc_status NOT IN ('not_submitted','pending','approved','rejected') THEN
    RAISE EXCEPTION 'Invalid kyc_status';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_vendor_kyc_fields_trg ON public.vendors;
CREATE TRIGGER validate_vendor_kyc_fields_trg
BEFORE INSERT OR UPDATE ON public.vendors
FOR EACH ROW EXECUTE FUNCTION public.validate_vendor_kyc_fields();

-- 3. Extend vendor verification notifier (approved + rejected + suspended)
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
        'Your application for "' || NEW.store_name || '" was not approved. You can update your details and reapply.',
        NEW.id, '{}'::jsonb
      );
    ELSIF NEW.verification_status = 'suspended' THEN
      PERFORM create_notification(
        NEW.user_id, 'vendor_suspended', 'Vendor Account Suspended',
        'Your store "' || NEW.store_name || '" has been suspended. Contact support for details.',
        NEW.id, '{}'::jsonb
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 4. KYC status change notifier
CREATE OR REPLACE FUNCTION public.on_vendor_kyc_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.kyc_status IS DISTINCT FROM NEW.kyc_status THEN
    IF NEW.kyc_status = 'approved' THEN
      PERFORM create_notification(
        NEW.user_id, 'kyc_approved', 'KYC Verified',
        'Your KYC has been verified. Your vendor application is now under final review.',
        NEW.id, '{}'::jsonb
      );
    ELSIF NEW.kyc_status = 'rejected' THEN
      PERFORM create_notification(
        NEW.user_id, 'kyc_rejected', 'KYC Needs Attention',
        COALESCE('KYC rejected: ' || NEW.kyc_rejection_reason, 'Your KYC submission needs corrections. Please review and resubmit.'),
        NEW.id, '{}'::jsonb
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_vendor_kyc_status_change_trg ON public.vendors;
CREATE TRIGGER on_vendor_kyc_status_change_trg
AFTER UPDATE ON public.vendors
FOR EACH ROW EXECUTE FUNCTION public.on_vendor_kyc_status_change();

-- Ensure verified-notify trigger is attached (idempotent)
DROP TRIGGER IF EXISTS on_vendor_verified_notify_trg ON public.vendors;
CREATE TRIGGER on_vendor_verified_notify_trg
AFTER UPDATE ON public.vendors
FOR EACH ROW EXECUTE FUNCTION public.on_vendor_verified_notify();

-- 5. Private storage bucket for KYC docs
INSERT INTO storage.buckets (id, name, public)
VALUES ('vendor-kyc', 'vendor-kyc', false)
ON CONFLICT (id) DO NOTHING;

-- Vendor reads/uploads own folder ({user_id}/...)
CREATE POLICY "Vendors read own KYC docs"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'vendor-kyc' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Vendors upload own KYC docs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'vendor-kyc' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Vendors update own KYC docs"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'vendor-kyc' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Vendors delete own KYC docs"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'vendor-kyc' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Admins read any KYC doc
CREATE POLICY "Admins read all KYC docs"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'vendor-kyc' AND public.has_role(auth.uid(), 'admin'));
