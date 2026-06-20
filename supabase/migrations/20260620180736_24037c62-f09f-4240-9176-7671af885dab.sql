
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS recipient_name text,
  ADD COLUMN IF NOT EXISTS recipient_phone text,
  ADD COLUMN IF NOT EXISTS recipient_email text,
  ADD COLUMN IF NOT EXISTS shipping_address text,
  ADD COLUMN IF NOT EXISTS shipping_city text,
  ADD COLUMN IF NOT EXISTS shipping_state text,
  ADD COLUMN IF NOT EXISTS shipping_pincode text,
  ADD COLUMN IF NOT EXISTS order_notes text;

-- Secure RPC: vendor or admin can fetch one order's customer + shipping details,
-- but only if it contains that vendor's items (or caller is admin).
CREATE OR REPLACE FUNCTION public.get_vendor_order_details(_order_id uuid)
RETURNS TABLE(
  id uuid,
  created_at timestamptz,
  order_status text,
  payment_status text,
  shipping_status text,
  total_amount numeric,
  recipient_name text,
  recipient_phone text,
  recipient_email text,
  shipping_address text,
  shipping_city text,
  shipping_state text,
  shipping_pincode text,
  order_notes text,
  shipping_provider text,
  tracking_id text,
  estimated_delivery date
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.is_vendor_order(_order_id, auth.uid())
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT o.id, o.created_at, o.order_status, o.payment_status, o.shipping_status,
         o.total_amount, o.recipient_name, o.recipient_phone, o.recipient_email,
         o.shipping_address, o.shipping_city, o.shipping_state, o.shipping_pincode,
         o.order_notes, o.shipping_provider, o.tracking_id, o.estimated_delivery
  FROM public.orders o
  WHERE o.id = _order_id;
END;
$$;

UPDATE public.platform_settings
SET value = jsonb_set(value, '{merchantName}', '"KoshurKart"'::jsonb)
WHERE key = 'payment_methods'
  AND COALESCE(value->>'merchantName', '') IN ('', 'Marketplace');
