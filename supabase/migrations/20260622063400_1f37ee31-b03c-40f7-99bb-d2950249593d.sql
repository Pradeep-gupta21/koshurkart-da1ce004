UPDATE public.vendors SET checkout_display_name = 'store' WHERE checkout_display_name IS NULL;
ALTER TABLE public.vendors ALTER COLUMN checkout_display_name SET DEFAULT 'store';