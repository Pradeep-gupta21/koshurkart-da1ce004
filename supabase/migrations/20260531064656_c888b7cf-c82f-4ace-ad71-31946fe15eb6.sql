
-- ============================================================
-- AUTH EVENTS (audit log)
-- ============================================================
CREATE TABLE public.auth_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  email text,
  event_type text NOT NULL,
  success boolean NOT NULL DEFAULT true,
  ip text,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.auth_events TO authenticated;
GRANT ALL ON public.auth_events TO service_role;

ALTER TABLE public.auth_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own auth events"
  ON public.auth_events FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins read all auth events"
  ON public.auth_events FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_auth_events_user_created ON public.auth_events (user_id, created_at DESC);
CREATE INDEX idx_auth_events_email_created ON public.auth_events (email, created_at DESC);

-- ============================================================
-- USER SESSIONS (device management)
-- ============================================================
CREATE TABLE public.user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  session_token_hash text NOT NULL,
  device_label text,
  ip text,
  user_agent text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE (user_id, session_token_hash)
);

GRANT SELECT, UPDATE ON public.user_sessions TO authenticated;
GRANT ALL ON public.user_sessions TO service_role;

ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own sessions"
  ON public.user_sessions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users revoke own sessions"
  ON public.user_sessions FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins view all sessions"
  ON public.user_sessions FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_user_sessions_user ON public.user_sessions (user_id, last_seen_at DESC);

-- ============================================================
-- AUTH RATE LIMITS (server-side throttling)
-- ============================================================
CREATE TABLE public.auth_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier text NOT NULL,
  action text NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.auth_rate_limits TO service_role;

ALTER TABLE public.auth_rate_limits ENABLE ROW LEVEL SECURITY;
-- no policies = only service_role (which bypasses RLS) can use it

CREATE INDEX idx_auth_rate_limits_lookup
  ON public.auth_rate_limits (identifier, action, attempted_at DESC);

-- ============================================================
-- HELPERS
-- ============================================================
CREATE OR REPLACE FUNCTION public.log_auth_event(
  _user_id uuid,
  _email text,
  _event_type text,
  _success boolean,
  _ip text,
  _user_agent text,
  _metadata jsonb
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.auth_events (user_id, email, event_type, success, ip, user_agent, metadata)
  VALUES (_user_id, _email, _event_type, _success, _ip, _user_agent, COALESCE(_metadata, '{}'::jsonb));
$$;

REVOKE ALL ON FUNCTION public.log_auth_event(uuid, text, text, boolean, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_auth_event(uuid, text, text, boolean, text, text, jsonb) TO service_role;

-- Sliding-window rate limit check (server side). Returns true if allowed.
CREATE OR REPLACE FUNCTION public.check_auth_rate_limit(
  _identifier text,
  _action text,
  _max_attempts integer,
  _window_seconds integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recent_count integer;
BEGIN
  DELETE FROM public.auth_rate_limits
  WHERE attempted_at < now() - (_window_seconds || ' seconds')::interval
    AND identifier = _identifier
    AND action = _action;

  SELECT COUNT(*) INTO recent_count
  FROM public.auth_rate_limits
  WHERE identifier = _identifier
    AND action = _action
    AND attempted_at > now() - (_window_seconds || ' seconds')::interval;

  IF recent_count >= _max_attempts THEN
    RETURN false;
  END IF;

  INSERT INTO public.auth_rate_limits (identifier, action) VALUES (_identifier, _action);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.check_auth_rate_limit(text, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_auth_rate_limit(text, text, integer, integer) TO service_role;

-- ============================================================
-- PERFORMANCE INDEXES (idempotent)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_products_vendor_status ON public.products (vendor_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_user_created ON public.orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON public.order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_vendor ON public.order_items (vendor_id);
CREATE INDEX IF NOT EXISTS idx_payments_order ON public.payments (order_id);
CREATE INDEX IF NOT EXISTS idx_payments_user_created ON public.payments (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_product_created ON public.analytics_events (product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_product ON public.reviews (product_id, created_at DESC);
