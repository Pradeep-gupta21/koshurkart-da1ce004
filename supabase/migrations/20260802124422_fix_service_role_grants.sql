-- Phase 4: Grant permissions to service_role for E2E tests
GRANT ALL ON TABLE public.orders TO service_role;
GRANT ALL ON TABLE public.order_items TO service_role;
GRANT ALL ON TABLE public.vendors TO service_role;
GRANT ALL ON TABLE public.products TO service_role;
