
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS recipient_backfilled_at timestamptz;

WITH src AS (
  SELECT
    o.id AS order_id,
    COALESCE(NULLIF(TRIM(p.name), ''), 'Customer') AS r_name,
    COALESCE(NULLIF(TRIM(p.phone), ''), 'Not provided') AS r_phone,
    NULLIF(TRIM(p.email), '') AS r_email,
    ul.pincode,
    ul.city,
    ul.state
  FROM public.orders o
  LEFT JOIN public.profiles p ON p.id = o.user_id
  LEFT JOIN LATERAL (
    SELECT pincode, city, state
    FROM public.user_locations
    WHERE user_id = o.user_id
    ORDER BY is_default DESC, created_at DESC
    LIMIT 1
  ) ul ON TRUE
  WHERE o.recipient_name IS NULL
     OR o.shipping_address IS NULL
     OR o.shipping_pincode IS NULL
)
UPDATE public.orders o
SET
  recipient_name        = COALESCE(o.recipient_name, src.r_name),
  recipient_phone       = COALESCE(o.recipient_phone, src.r_phone),
  recipient_email       = COALESCE(o.recipient_email, src.r_email),
  shipping_address      = COALESCE(o.shipping_address, 'Address unavailable — legacy order'),
  shipping_city         = COALESCE(o.shipping_city, src.city, 'Unknown'),
  shipping_state        = COALESCE(o.shipping_state, src.state),
  shipping_pincode      = COALESCE(o.shipping_pincode, src.pincode, '000000'),
  recipient_backfilled_at = now()
FROM src
WHERE o.id = src.order_id;
