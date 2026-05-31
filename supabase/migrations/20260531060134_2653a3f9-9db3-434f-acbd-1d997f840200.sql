
-- 1. platform_settings: admin-only read
DROP POLICY IF EXISTS "Anyone can read settings" ON public.platform_settings;
REVOKE SELECT ON public.platform_settings FROM anon;

-- 2. reviews: hide internal moderation fields from anon
REVOKE SELECT (is_suspicious, flagged_reason, moderation_status) ON public.reviews FROM anon;

-- 3. ad_campaigns: hide financial/performance columns from anon
REVOKE SELECT (bid_amount, budget, daily_limit, impressions, clicks, conversions, quality_score, effective_score)
  ON public.ad_campaigns FROM anon;

-- 4. product-images bucket: require vendor account to upload
DROP POLICY IF EXISTS "Authenticated users can upload product images" ON storage.objects;
CREATE POLICY "Vendors can upload product images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'product-images'
  AND EXISTS (SELECT 1 FROM public.vendors v WHERE v.user_id = auth.uid())
);

-- 5. Revoke anon EXECUTE on internal SECURITY DEFINER functions that are never meant to be called by unauthenticated clients.
REVOKE EXECUTE ON FUNCTION public.recalculate_ad_quality_score(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.calculate_dynamic_prices() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.recalculate_vendor_trust_score(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.calculate_product_scores() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.reserve_stock(uuid, integer) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.confirm_stock(uuid, integer) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.release_stock(uuid, integer) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.create_notification(uuid, text, text, text, uuid, jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.log_payment_event(uuid, text, text, jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.sweep_stale_orders() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.detect_abnormal_purchases() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.vendor_apply(text, text, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_review_product(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_order_owner(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_vendor_order(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.quote_rate_limit(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.checkout_rate_limit(uuid) FROM anon, public;

GRANT EXECUTE ON FUNCTION public.vendor_apply(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_review_product(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_order_owner(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_vendor_order(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.quote_rate_limit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.checkout_rate_limit(uuid) TO authenticated;
