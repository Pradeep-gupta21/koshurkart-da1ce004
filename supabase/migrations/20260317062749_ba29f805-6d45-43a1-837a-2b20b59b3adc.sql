
-- Add auction columns to ad_campaigns
ALTER TABLE public.ad_campaigns
  ADD COLUMN IF NOT EXISTS bid_amount numeric NOT NULL DEFAULT 0.10,
  ADD COLUMN IF NOT EXISTS quality_score numeric DEFAULT 50,
  ADD COLUMN IF NOT EXISTS effective_score numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS conversions integer DEFAULT 0;

-- Add minimum_bid to ad_placements
ALTER TABLE public.ad_placements
  ADD COLUMN IF NOT EXISTS minimum_bid numeric DEFAULT 0.01;

-- Initialize effective_score for existing rows
UPDATE public.ad_campaigns SET effective_score = bid_amount * (quality_score / 100.0);

-- Function: recalculate quality score for a campaign
CREATE OR REPLACE FUNCTION public.recalculate_ad_quality_score(p_campaign_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _impressions integer;
  _clicks integer;
  _conversions integer;
  _bid numeric;
  _vendor_id uuid;
  _trust_score numeric;
  _ctr_component numeric;
  _conv_component numeric;
  _quality numeric;
  _effective numeric;
BEGIN
  SELECT impressions, clicks, conversions, bid_amount, vendor_id
  INTO _impressions, _clicks, _conversions, _bid, _vendor_id
  FROM ad_campaigns WHERE id = p_campaign_id;

  IF _impressions IS NULL THEN RETURN; END IF;

  -- CTR component (ctr * 1000, capped at 100)
  IF COALESCE(_impressions, 0) > 0 THEN
    _ctr_component := LEAST((COALESCE(_clicks, 0)::numeric / _impressions) * 1000, 100);
  ELSE
    _ctr_component := 0;
  END IF;

  -- Conversion rate component (conv_rate * 100, capped at 100)
  IF COALESCE(_clicks, 0) > 0 THEN
    _conv_component := LEAST((COALESCE(_conversions, 0)::numeric / _clicks) * 100, 100);
  ELSE
    _conv_component := 0;
  END IF;

  -- Vendor trust score
  SELECT COALESCE(trust_score, 50) INTO _trust_score
  FROM vendors WHERE id = _vendor_id;

  -- Quality score = 0.4 * CTR + 0.3 * conv + 0.3 * trust
  _quality := 0.4 * _ctr_component + 0.3 * _conv_component + 0.3 * _trust_score;
  _quality := GREATEST(0, LEAST(100, _quality));

  -- Effective score = bid * (quality / 100)
  _effective := _bid * (_quality / 100.0);

  UPDATE ad_campaigns
  SET quality_score = _quality, effective_score = _effective
  WHERE id = p_campaign_id;
END;
$$;

-- Function: get auction winners for a placement
CREATE OR REPLACE FUNCTION public.get_auction_winners(p_placement text, p_limit integer DEFAULT 3)
RETURNS TABLE(
  campaign_id uuid,
  product_id uuid,
  vendor_id uuid,
  bid_amount numeric,
  quality_score numeric,
  effective_score numeric,
  impressions integer,
  clicks integer,
  conversions integer,
  title text,
  slug text,
  price numeric,
  discount_price numeric,
  images text[],
  rating numeric,
  review_count integer,
  category text,
  store_name text,
  created_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    ac.id AS campaign_id,
    ac.product_id,
    ac.vendor_id,
    ac.bid_amount,
    ac.quality_score,
    ac.effective_score,
    ac.impressions,
    ac.clicks,
    ac.conversions,
    p.title,
    p.slug,
    p.price,
    p.discount_price,
    p.images,
    p.rating,
    p.review_count,
    p.category,
    v.store_name,
    ac.created_at
  FROM ad_campaigns ac
  JOIN products p ON p.id = ac.product_id
  JOIN vendors v ON v.id = ac.vendor_id
  WHERE ac.placement = p_placement
    AND ac.status = 'approved'
    AND ac.start_date <= CURRENT_DATE
    AND (ac.end_date IS NULL OR ac.end_date >= CURRENT_DATE)
    AND p.status = 'active'
  ORDER BY ac.effective_score DESC
  LIMIT p_limit;
$$;

-- Update track_ad_event to recalculate quality score
CREATE OR REPLACE FUNCTION public.track_ad_event(_campaign_id uuid, _event_type text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF _event_type = 'impression' THEN
    UPDATE ad_campaigns SET impressions = COALESCE(impressions, 0) + 1 WHERE id = _campaign_id AND status = 'approved';
  ELSIF _event_type = 'click' THEN
    UPDATE ad_campaigns SET clicks = COALESCE(clicks, 0) + 1 WHERE id = _campaign_id AND status = 'approved';
  END IF;
  -- Recalculate quality score after event
  PERFORM recalculate_ad_quality_score(_campaign_id);
END;
$$;

-- Trigger function: increment conversions on purchase events
CREATE OR REPLACE FUNCTION public.on_purchase_conversion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _campaign record;
BEGIN
  IF NEW.event_type = 'purchase' AND NEW.product_id IS NOT NULL THEN
    FOR _campaign IN
      SELECT id FROM ad_campaigns
      WHERE product_id = NEW.product_id
        AND status = 'approved'
        AND start_date <= CURRENT_DATE
        AND (end_date IS NULL OR end_date >= CURRENT_DATE)
    LOOP
      UPDATE ad_campaigns SET conversions = COALESCE(conversions, 0) + 1 WHERE id = _campaign.id;
      PERFORM recalculate_ad_quality_score(_campaign.id);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

-- Attach conversion trigger
CREATE TRIGGER trg_purchase_conversion
  AFTER INSERT ON public.analytics_events
  FOR EACH ROW
  EXECUTE FUNCTION public.on_purchase_conversion();
