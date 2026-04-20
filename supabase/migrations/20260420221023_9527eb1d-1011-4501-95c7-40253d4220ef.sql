-- Extend vendors with onboarding v2 columns
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS tagline text,
  ADD COLUMN IF NOT EXISTS banner text,
  ADD COLUMN IF NOT EXISTS pickup_address_line1 text,
  ADD COLUMN IF NOT EXISTS pickup_address_line2 text,
  ADD COLUMN IF NOT EXISTS pickup_city text,
  ADD COLUMN IF NOT EXISTS pickup_state text,
  ADD COLUMN IF NOT EXISTS pickup_pincode text,
  ADD COLUMN IF NOT EXISTS pickup_country text DEFAULT 'IN',
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS phone_verified_at timestamptz;

-- Extend validation trigger to cover pickup pincode + phone + tagline length
CREATE OR REPLACE FUNCTION public.validate_vendor_kyc_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
  IF NEW.pickup_pincode IS NOT NULL AND NEW.pickup_pincode <> '' AND NEW.pickup_pincode !~ '^\d{6}$' THEN
    RAISE EXCEPTION 'Invalid pickup pincode (must be 6 digits)';
  END IF;
  IF NEW.phone IS NOT NULL AND NEW.phone <> '' AND NEW.phone !~ '^\+?[1-9]\d{9,14}$' THEN
    RAISE EXCEPTION 'Invalid phone number format';
  END IF;
  IF NEW.tagline IS NOT NULL AND length(NEW.tagline) > 80 THEN
    RAISE EXCEPTION 'Tagline must be 80 characters or fewer';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS validate_vendor_kyc_fields_trg ON public.vendors;
CREATE TRIGGER validate_vendor_kyc_fields_trg
  BEFORE INSERT OR UPDATE ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION public.validate_vendor_kyc_fields();

-- Onboarding drafts table
CREATE TABLE IF NOT EXISTS public.vendor_onboarding_drafts (
  user_id uuid PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  current_step int NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vendor_onboarding_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "User reads own draft" ON public.vendor_onboarding_drafts;
CREATE POLICY "User reads own draft"
  ON public.vendor_onboarding_drafts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "User inserts own draft" ON public.vendor_onboarding_drafts;
CREATE POLICY "User inserts own draft"
  ON public.vendor_onboarding_drafts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "User updates own draft" ON public.vendor_onboarding_drafts;
CREATE POLICY "User updates own draft"
  ON public.vendor_onboarding_drafts FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "User deletes own draft" ON public.vendor_onboarding_drafts;
CREATE POLICY "User deletes own draft"
  ON public.vendor_onboarding_drafts FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS set_vendor_onboarding_drafts_updated_at ON public.vendor_onboarding_drafts;
CREATE TRIGGER set_vendor_onboarding_drafts_updated_at
  BEFORE UPDATE ON public.vendor_onboarding_drafts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();