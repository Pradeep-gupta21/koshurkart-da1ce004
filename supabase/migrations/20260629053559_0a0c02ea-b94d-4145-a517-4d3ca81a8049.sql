CREATE OR REPLACE FUNCTION public.search_vendors_admin(_search text DEFAULT NULL, _limit int DEFAULT 500)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  store_name text,
  store_slug text,
  description text,
  verification_status text,
  kyc_status text,
  is_verified boolean,
  is_commission_exempt boolean,
  trust_score numeric,
  created_at timestamptz,
  owner_name text,
  owner_email text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY
    SELECT v.id, v.user_id, v.store_name, v.store_slug, v.description,
           v.verification_status, v.kyc_status, v.is_verified, v.is_commission_exempt,
           v.trust_score, v.created_at,
           p.name AS owner_name, p.email AS owner_email
    FROM public.vendors v
    LEFT JOIN public.profiles p ON p.id = v.user_id
    WHERE _search IS NULL OR _search = ''
       OR v.store_name ILIKE '%' || _search || '%'
       OR v.store_slug ILIKE '%' || _search || '%'
       OR COALESCE(p.name, '') ILIKE '%' || _search || '%'
       OR COALESCE(p.email, '') ILIKE '%' || _search || '%'
    ORDER BY v.created_at DESC
    LIMIT _limit;
END;
$$;

REVOKE ALL ON FUNCTION public.search_vendors_admin(text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_vendors_admin(text, int) TO authenticated, service_role;