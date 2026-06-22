GRANT SELECT ON public.serviceable_pincodes TO anon;
GRANT SELECT ON public.serviceable_pincodes TO authenticated;
GRANT ALL ON public.serviceable_pincodes TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_locations TO authenticated;
GRANT ALL ON public.user_locations TO service_role;

GRANT SELECT ON public.vendor_serviceability TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_serviceability TO authenticated;
GRANT ALL ON public.vendor_serviceability TO service_role;