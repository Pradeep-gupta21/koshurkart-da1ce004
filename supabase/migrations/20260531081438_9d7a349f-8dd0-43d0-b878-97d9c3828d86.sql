-- Enforce Terms & Conditions acceptance for email/password signups
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _store_name TEXT;
  _store_slug TEXT;
  _vendor_id UUID;
  _terms_accepted BOOLEAN;
  _provider TEXT;
BEGIN
  _provider := COALESCE(NEW.raw_app_meta_data->>'provider', 'email');
  _terms_accepted := COALESCE((NEW.raw_user_meta_data->>'terms_accepted')::boolean, false);

  -- For native email/password signups, require explicit T&C acceptance.
  -- OAuth providers (Google, etc.) and phone OTP are implicitly consenting
  -- by the connect flow shown in the UI.
  IF _provider = 'email' AND NOT _terms_accepted THEN
    RAISE EXCEPTION 'You must accept the Terms & Conditions and Privacy Policy to create an account.'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.profiles (id, name, email, phone, terms_accepted_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.email, ''),
    NEW.phone,
    CASE WHEN _terms_accepted OR _provider <> 'email' THEN now() ELSE NULL END
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');

  _store_name := NEW.raw_user_meta_data->>'store_name';
  IF _store_name IS NOT NULL AND _store_name != '' THEN
    _store_slug := NEW.raw_user_meta_data->>'store_slug';
    INSERT INTO public.vendors (user_id, store_name, store_slug)
    VALUES (NEW.id, _store_name, _store_slug)
    RETURNING id INTO _vendor_id;
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'vendor');
  END IF;

  RETURN NEW;
END;
$function$;