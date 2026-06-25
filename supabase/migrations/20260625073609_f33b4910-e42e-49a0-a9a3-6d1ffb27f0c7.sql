CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _store_name TEXT;
  _store_slug TEXT;
  _base_slug TEXT;
  _candidate TEXT;
  _suffix INT := 0;
  _vendor_id UUID;
  _terms_accepted BOOLEAN;
  _provider TEXT;
BEGIN
  _provider := COALESCE(NEW.raw_app_meta_data->>'provider', 'email');
  _terms_accepted := COALESCE((NEW.raw_user_meta_data->>'terms_accepted')::boolean, false);

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
  VALUES (NEW.id, 'user')
  ON CONFLICT (user_id, role) DO NOTHING;

  _store_name := NULLIF(TRIM(NEW.raw_user_meta_data->>'store_name'), '');
  IF _store_name IS NOT NULL THEN
    -- Skip if this user is already a vendor (idempotency for retries)
    IF EXISTS (SELECT 1 FROM public.vendors WHERE user_id = NEW.id) THEN
      RETURN NEW;
    END IF;

    _base_slug := NULLIF(regexp_replace(lower(COALESCE(NEW.raw_user_meta_data->>'store_slug', _store_name)),
                                        '[^a-z0-9]+', '-', 'g'), '');
    _base_slug := regexp_replace(_base_slug, '(^-+|-+$)', '', 'g');
    IF _base_slug IS NULL OR _base_slug = '' THEN
      _base_slug := 'store-' || substr(NEW.id::text, 1, 8);
    END IF;

    _candidate := _base_slug;
    -- Find a unique slug; cap retries to avoid infinite loop
    WHILE EXISTS (SELECT 1 FROM public.vendors WHERE store_slug = _candidate) AND _suffix < 50 LOOP
      _suffix := _suffix + 1;
      _candidate := _base_slug || '-' || _suffix;
    END LOOP;
    -- Final fallback uses user id suffix to guarantee uniqueness
    IF EXISTS (SELECT 1 FROM public.vendors WHERE store_slug = _candidate) THEN
      _candidate := _base_slug || '-' || substr(NEW.id::text, 1, 8);
    END IF;

    BEGIN
      INSERT INTO public.vendors (user_id, store_name, store_slug, verification_status)
      VALUES (NEW.id, _store_name, _candidate, 'pending')
      RETURNING id INTO _vendor_id;
    EXCEPTION WHEN unique_violation THEN
      -- Race condition: re-attempt with id-suffixed slug
      INSERT INTO public.vendors (user_id, store_name, store_slug, verification_status)
      VALUES (NEW.id, _store_name, _base_slug || '-' || substr(NEW.id::text, 1, 8), 'pending')
      RETURNING id INTO _vendor_id;
    END;

    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'vendor')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;