
-- Re-grant full SELECT on reviews; we will enforce confidentiality via RLS instead.
GRANT SELECT ON public.reviews TO anon, authenticated;

DROP POLICY IF EXISTS "Anyone can view reviews" ON public.reviews;

-- Public/auth can read approved reviews only
CREATE POLICY "Approved reviews are viewable"
  ON public.reviews FOR SELECT
  USING (moderation_status = 'approved');

-- Owners can always read their own (even if pending/flagged)
CREATE POLICY "Users view own reviews"
  ON public.reviews FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Admins see everything
CREATE POLICY "Admins view all reviews"
  ON public.reviews FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
