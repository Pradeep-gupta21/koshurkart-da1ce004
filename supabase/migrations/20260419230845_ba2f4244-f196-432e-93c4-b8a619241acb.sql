
-- 1. Extend reviews table
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS order_id uuid,
  ADD COLUMN IF NOT EXISTS images text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS helpful_count integer NOT NULL DEFAULT 0;

-- Unique constraint to prevent duplicate reviews
DO $$ BEGIN
  ALTER TABLE public.reviews ADD CONSTRAINT reviews_user_product_unique UNIQUE (user_id, product_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Indexes for sorting
CREATE INDEX IF NOT EXISTS idx_reviews_product_created ON public.reviews(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_product_helpful ON public.reviews(product_id, helpful_count DESC);

-- 2. review_helpful_votes table
CREATE TABLE IF NOT EXISTS public.review_helpful_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (review_id, user_id)
);

ALTER TABLE public.review_helpful_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view helpful votes" ON public.review_helpful_votes;
CREATE POLICY "Anyone can view helpful votes"
  ON public.review_helpful_votes FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users insert own helpful votes" ON public.review_helpful_votes;
CREATE POLICY "Users insert own helpful votes"
  ON public.review_helpful_votes FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users delete own helpful votes" ON public.review_helpful_votes;
CREATE POLICY "Users delete own helpful votes"
  ON public.review_helpful_votes FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Trigger: maintain helpful_count
CREATE OR REPLACE FUNCTION public.on_helpful_vote_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.reviews SET helpful_count = helpful_count + 1 WHERE id = NEW.review_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.reviews SET helpful_count = GREATEST(helpful_count - 1, 0) WHERE id = OLD.review_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_helpful_vote_insert ON public.review_helpful_votes;
CREATE TRIGGER trg_helpful_vote_insert
  AFTER INSERT ON public.review_helpful_votes
  FOR EACH ROW EXECUTE FUNCTION public.on_helpful_vote_change();

DROP TRIGGER IF EXISTS trg_helpful_vote_delete ON public.review_helpful_votes;
CREATE TRIGGER trg_helpful_vote_delete
  AFTER DELETE ON public.review_helpful_votes
  FOR EACH ROW EXECUTE FUNCTION public.on_helpful_vote_change();

-- 3. can_review_product function
CREATE OR REPLACE FUNCTION public.can_review_product(_user_id uuid, _product_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.id
  FROM orders o
  JOIN order_items oi ON oi.order_id = o.id
  WHERE o.user_id = _user_id
    AND oi.product_id = _product_id
    AND o.order_status = 'delivered'
    AND NOT EXISTS (
      SELECT 1 FROM reviews r WHERE r.user_id = _user_id AND r.product_id = _product_id
    )
  ORDER BY o.created_at DESC
  LIMIT 1;
$$;

-- 4. Update RLS on reviews — replace insert policy
DROP POLICY IF EXISTS "Users create reviews" ON public.reviews;
CREATE POLICY "Users create verified reviews"
  ON public.reviews FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND order_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      WHERE o.id = reviews.order_id
        AND o.user_id = auth.uid()
        AND oi.product_id = reviews.product_id
        AND o.order_status = 'delivered'
    )
  );

-- Auto-set is_verified_purchase = true on insert
CREATE OR REPLACE FUNCTION public.set_review_verified()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.is_verified_purchase := true;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_review_verified ON public.reviews;
CREATE TRIGGER trg_set_review_verified
  BEFORE INSERT ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.set_review_verified();

-- Re-attach existing review triggers (in case they were lost)
DROP TRIGGER IF EXISTS trg_flag_suspicious_review ON public.reviews;
CREATE TRIGGER trg_flag_suspicious_review
  BEFORE INSERT ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.flag_suspicious_review();

DROP TRIGGER IF EXISTS trg_review_insert ON public.reviews;
CREATE TRIGGER trg_review_insert
  AFTER INSERT ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.on_review_insert();

DROP TRIGGER IF EXISTS trg_review_notify_vendor ON public.reviews;
CREATE TRIGGER trg_review_notify_vendor
  AFTER INSERT ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.on_review_notify_vendor();

-- 6. Trigger to recompute product rating + review_count
CREATE OR REPLACE FUNCTION public.recompute_product_rating()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _product_id uuid;
  _avg numeric;
  _count integer;
BEGIN
  _product_id := COALESCE(NEW.product_id, OLD.product_id);
  SELECT COALESCE(AVG(rating), 0), COUNT(*)
    INTO _avg, _count
    FROM reviews
    WHERE product_id = _product_id AND moderation_status = 'approved';
  UPDATE products SET rating = ROUND(_avg, 2), review_count = _count WHERE id = _product_id;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_recompute_product_rating ON public.reviews;
CREATE TRIGGER trg_recompute_product_rating
  AFTER INSERT OR UPDATE OR DELETE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.recompute_product_rating();

-- 5. Storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('review-images', 'review-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Review images public read" ON storage.objects;
CREATE POLICY "Review images public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'review-images');

DROP POLICY IF EXISTS "Users upload own review images" ON storage.objects;
CREATE POLICY "Users upload own review images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'review-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users delete own review images" ON storage.objects;
CREATE POLICY "Users delete own review images"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'review-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
