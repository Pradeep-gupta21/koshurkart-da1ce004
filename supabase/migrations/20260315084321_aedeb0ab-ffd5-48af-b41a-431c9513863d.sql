
-- Security definer function for vendor applications
CREATE OR REPLACE FUNCTION public.vendor_apply(_store_name text, _store_slug text, _description text DEFAULT '')
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _user_id uuid;
  _vendor_id uuid;
BEGIN
  _user_id := auth.uid();
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check if already a vendor
  IF EXISTS (SELECT 1 FROM public.vendors WHERE user_id = _user_id) THEN
    RAISE EXCEPTION 'Already a vendor';
  END IF;

  -- Insert vendor record
  INSERT INTO public.vendors (user_id, store_name, store_slug, description, verification_status)
  VALUES (_user_id, _store_name, _store_slug, _description, 'pending')
  RETURNING id INTO _vendor_id;

  -- Add vendor role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (_user_id, 'vendor')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN _vendor_id;
END;
$$;

-- Allow admins to update vendor verification_status
-- (existing "Vendor owner can update" policy already handles vendor self-updates;
--  we need a separate policy for admin updates)
CREATE POLICY "Admin can update vendors"
ON public.vendors
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
