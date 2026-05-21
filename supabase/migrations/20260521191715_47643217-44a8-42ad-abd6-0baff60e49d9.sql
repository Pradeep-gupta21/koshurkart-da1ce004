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
BEGIN
  INSERT INTO public.profiles (id, name, email, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.email, ''),
    NEW.phone
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