
-- ============================================================
-- Production-readiness hardening: PII protection, storage isolation,
-- and missing indexes for hot query paths.
-- ============================================================

-- 1. PROFILES: stop leaking email/phone publicly via PostgREST column grants.
--    Keep the RLS "Anyone can view profiles" policy so author names render,
--    but anon/authenticated can only SELECT non-PII columns.
REVOKE ALL ON public.profiles FROM anon, authenticated;

-- Anyone may read non-PII fields (used for review authorship, vendor names, etc.)
GRANT SELECT (id, name, avatar, country, created_at) ON public.profiles TO anon;
GRANT SELECT (id, name, avatar, country, created_at) ON public.profiles TO authenticated;

-- The owner needs to see their own PII; RLS already restricts UPDATE to owner.
-- For SELECT of PII columns we add a secure RPC owners can call.
CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS TABLE (
  id uuid, name text, email text, phone text, avatar text,
  country text, preferred_currency text, default_pincode text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, name, email, phone, avatar, country, preferred_currency, default_pincode, created_at
  FROM public.profiles WHERE id = auth.uid();
$$;
REVOKE EXECUTE ON FUNCTION public.get_my_profile() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;

GRANT UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

-- 2. STORAGE: product-images — block cross-vendor path overwrites.
DROP POLICY IF EXISTS "Vendors can upload product images" ON storage.objects;
CREATE POLICY "Vendors can upload product images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'product-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
  AND EXISTS (SELECT 1 FROM public.vendors v WHERE v.user_id = auth.uid())
);

DROP POLICY IF EXISTS "Vendors can update own product images" ON storage.objects;
CREATE POLICY "Vendors can update own product images"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'product-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'product-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- 3. PERFORMANCE: missing indexes on hot query paths.
CREATE INDEX IF NOT EXISTS idx_orders_user_created
  ON public.orders (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_order_items_vendor_created
  ON public.order_items (vendor_id);

CREATE INDEX IF NOT EXISTS idx_order_items_order
  ON public.order_items (order_id);

CREATE INDEX IF NOT EXISTS idx_payments_order
  ON public.payments (order_id);

CREATE INDEX IF NOT EXISTS idx_payments_razorpay_order
  ON public.payments (razorpay_order_id) WHERE razorpay_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_analytics_events_product_type_created
  ON public.analytics_events (product_id, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_events_campaign_created
  ON public.analytics_events (campaign_id, created_at DESC) WHERE campaign_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications (user_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reviews_product_moderation
  ON public.reviews (product_id, moderation_status);

CREATE INDEX IF NOT EXISTS idx_products_vendor_status
  ON public.products (vendor_id, status);

CREATE INDEX IF NOT EXISTS idx_products_status_trending
  ON public.products (status, trending_score DESC);

CREATE INDEX IF NOT EXISTS idx_ad_campaigns_status_score
  ON public.ad_campaigns (status, effective_score DESC);

CREATE INDEX IF NOT EXISTS idx_webhook_events_provider_id
  ON public.webhook_events (provider, provider_event_id);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_active
  ON public.user_sessions (user_id, revoked_at);

CREATE INDEX IF NOT EXISTS idx_auth_events_user_created
  ON public.auth_events (user_id, created_at DESC);
