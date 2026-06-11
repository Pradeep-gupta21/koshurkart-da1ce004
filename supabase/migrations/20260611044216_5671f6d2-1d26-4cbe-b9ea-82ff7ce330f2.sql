
-- 1. PROFILES
DROP POLICY IF EXISTS "Anyone can view profiles" ON public.profiles;
CREATE POLICY "Users view own profile" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Admins view all profiles" ON public.profiles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 2. VENDORS column-level grants
REVOKE SELECT ON public.vendors FROM anon, authenticated;
GRANT SELECT (
  id, user_id, store_name, store_slug, logo, description, verification_status,
  rating, total_sales, created_at, trust_score, delivery_rate, cancellation_rate,
  return_rate, review_rating, is_verified, business_name, business_type,
  category, tagline, banner, pickup_city, pickup_state, pickup_pincode, pickup_country,
  phone_verified_at
) ON public.vendors TO anon, authenticated;

-- 3. REVIEWS column-level grants
REVOKE SELECT ON public.reviews FROM anon, authenticated;
GRANT SELECT (
  id, user_id, product_id, order_id, rating, comment, images,
  helpful_count, is_verified_purchase, moderation_status, created_at
) ON public.reviews TO anon, authenticated;

-- 4. Admin-only suspicious review counter
CREATE OR REPLACE FUNCTION public.count_suspicious_reviews()
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE WHEN public.has_role(auth.uid(), 'admin'::app_role)
    THEN (SELECT COUNT(*)::int FROM public.reviews
          WHERE is_suspicious = true AND moderation_status = 'pending')
    ELSE 0
  END;
$$;
REVOKE EXECUTE ON FUNCTION public.count_suspicious_reviews() FROM anon;
GRANT EXECUTE ON FUNCTION public.count_suspicious_reviews() TO authenticated;

-- 5. Lock dynamic-pricing RPC
REVOKE EXECUTE ON FUNCTION public.calculate_dynamic_prices() FROM anon, authenticated, public;
