
-- Add fraud detection columns to reviews
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS is_suspicious boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS flagged_reason text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS moderation_status text DEFAULT 'pending';

-- Allow admins to update reviews (for moderation)
CREATE POLICY "Admin updates reviews"
  ON public.reviews FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- Trigger function for automated fraud detection
CREATE OR REPLACE FUNCTION public.flag_suspicious_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _reasons text[] := '{}';
  _vendor_reviews_count integer;
  _purchase_time timestamptz;
  _account_age interval;
  _five_star_count integer;
BEGIN
  -- Rule 1: Same-vendor spam (3+ reviews for same vendor's products in 24h)
  SELECT COUNT(*) INTO _vendor_reviews_count
  FROM reviews r
  JOIN products p ON p.id = r.product_id
  WHERE r.user_id = NEW.user_id
    AND r.id != NEW.id
    AND r.created_at > now() - interval '24 hours'
    AND p.vendor_id = (SELECT vendor_id FROM products WHERE id = NEW.product_id);

  IF _vendor_reviews_count >= 2 THEN
    _reasons := array_append(_reasons, 'Same-vendor spam: 3+ reviews for one vendor in 24h');
  END IF;

  -- Rule 2: Too-fast review (< 1 minute after purchase)
  SELECT MAX(o.created_at) INTO _purchase_time
  FROM orders o
  JOIN order_items oi ON oi.order_id = o.id
  WHERE o.user_id = NEW.user_id
    AND oi.product_id = NEW.product_id
    AND o.order_status IN ('delivered', 'processing', 'shipped');

  IF _purchase_time IS NOT NULL AND (NEW.created_at - _purchase_time) < interval '1 minute' THEN
    _reasons := array_append(_reasons, 'Rapid review: submitted < 1 min after purchase');
  END IF;

  -- Rule 3: New account spam (account < 7 days, 5+ five-star reviews)
  SELECT (now() - u.created_at) INTO _account_age
  FROM auth.users u WHERE u.id = NEW.user_id;

  IF _account_age < interval '7 days' THEN
    SELECT COUNT(*) INTO _five_star_count
    FROM reviews
    WHERE user_id = NEW.user_id AND rating = 5 AND id != NEW.id;

    IF _five_star_count >= 4 AND NEW.rating = 5 THEN
      _reasons := array_append(_reasons, 'New account spam: 5+ five-star reviews from account < 7 days old');
    END IF;
  END IF;

  -- Apply flags if any rules triggered
  IF array_length(_reasons, 1) > 0 THEN
    NEW.is_suspicious := true;
    NEW.flagged_reason := array_to_string(_reasons, '; ');
    NEW.moderation_status := 'pending';
  ELSE
    NEW.moderation_status := 'approved';
  END IF;

  RETURN NEW;
END;
$$;

-- Attach trigger
CREATE TRIGGER trg_flag_suspicious_review
  BEFORE INSERT ON public.reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.flag_suspicious_review();
