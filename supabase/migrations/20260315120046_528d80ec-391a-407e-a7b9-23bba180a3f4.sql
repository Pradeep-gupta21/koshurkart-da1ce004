
CREATE OR REPLACE FUNCTION public.track_ad_event(_campaign_id uuid, _event_type text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _event_type = 'impression' THEN
    UPDATE ad_campaigns SET impressions = COALESCE(impressions, 0) + 1 WHERE id = _campaign_id AND status = 'approved';
  ELSIF _event_type = 'click' THEN
    UPDATE ad_campaigns SET clicks = COALESCE(clicks, 0) + 1 WHERE id = _campaign_id AND status = 'approved';
  END IF;
END;
$$;

-- Allow public (anon + authenticated) to call this function
GRANT EXECUTE ON FUNCTION public.track_ad_event(uuid, text) TO anon, authenticated;

-- Add policy for anon/public to SELECT approved campaigns (for storefront display)
CREATE POLICY "Anyone can view approved campaigns"
ON public.ad_campaigns FOR SELECT
TO public
USING (status = 'approved');
