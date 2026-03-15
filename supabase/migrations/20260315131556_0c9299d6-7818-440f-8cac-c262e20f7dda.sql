
-- Analytics events table
CREATE TABLE public.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  user_id uuid,
  product_id uuid,
  campaign_id uuid,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Suspicious clicks table
CREATE TABLE public.suspicious_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  campaign_id uuid NOT NULL,
  click_count integer NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL,
  flagged_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suspicious_clicks ENABLE ROW LEVEL SECURITY;

-- RLS: Anyone can insert analytics events (authenticated)
CREATE POLICY "Authenticated users insert events"
  ON public.analytics_events FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- RLS: Anon users insert events with null user_id
CREATE POLICY "Anon users insert events"
  ON public.analytics_events FOR INSERT TO anon
  WITH CHECK (user_id IS NULL);

-- RLS: Admins can read all events
CREATE POLICY "Admins read all events"
  ON public.analytics_events FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'));

-- RLS: Vendors read events for their products
CREATE POLICY "Vendors read own product events"
  ON public.analytics_events FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM products p
      JOIN vendors v ON v.id = p.vendor_id
      WHERE p.id = analytics_events.product_id AND v.user_id = auth.uid()
    )
  );

-- RLS: Admins read suspicious clicks
CREATE POLICY "Admins read suspicious clicks"
  ON public.suspicious_clicks FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'));

-- Security definer function for recording events + fraud detection
CREATE OR REPLACE FUNCTION public.record_analytics_event(
  _event_type text,
  _product_id uuid DEFAULT NULL,
  _campaign_id uuid DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _user_id uuid;
  _recent_clicks integer;
BEGIN
  _user_id := auth.uid();

  -- Insert event
  INSERT INTO analytics_events (event_type, user_id, product_id, campaign_id, metadata)
  VALUES (_event_type, _user_id, _product_id, _campaign_id, _metadata);

  -- Fraud detection: check ad_click frequency
  IF _event_type = 'ad_click' AND _user_id IS NOT NULL AND _campaign_id IS NOT NULL THEN
    SELECT COUNT(*) INTO _recent_clicks
    FROM analytics_events
    WHERE user_id = _user_id
      AND campaign_id = _campaign_id
      AND event_type = 'ad_click'
      AND created_at > now() - interval '1 hour';

    IF _recent_clicks > 10 THEN
      INSERT INTO suspicious_clicks (user_id, campaign_id, click_count, window_start)
      VALUES (_user_id, _campaign_id, _recent_clicks, now() - interval '1 hour')
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
END;
$$;

-- Enable realtime on suspicious_clicks for admin dashboard
ALTER PUBLICATION supabase_realtime ADD TABLE public.suspicious_clicks;
