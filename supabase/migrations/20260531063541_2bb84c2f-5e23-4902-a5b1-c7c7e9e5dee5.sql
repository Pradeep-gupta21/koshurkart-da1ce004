-- Properly enforce vendor column-level security.
-- Prior REVOKE SELECT(cols) was a no-op because anon/authenticated held
-- table-wide SELECT. Switch to allow-list grants instead.

REVOKE ALL ON public.vendors FROM anon, authenticated;

-- Public-safe columns: storefront identity + reputation aggregates.
GRANT SELECT (
  id, user_id, store_name, store_slug, description,
  logo, banner, tagline, category,
  rating, review_rating, trust_score,
  is_verified, verification_status,
  pickup_city, pickup_state, pickup_country,
  delivery_rate, cancellation_rate, return_rate,
  total_sales, created_at
) ON public.vendors TO anon, authenticated;

-- Writes are still RLS-gated by existing policies; restore INSERT/UPDATE.
GRANT INSERT, UPDATE ON public.vendors TO authenticated;

-- Ensure service role retains full access (used by edge functions / RPCs).
GRANT ALL ON public.vendors TO service_role;