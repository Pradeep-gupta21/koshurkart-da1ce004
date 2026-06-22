
-- Safe wrapper: advisory lock + error trapping
CREATE OR REPLACE FUNCTION public.refresh_trending_scores()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_got_lock boolean;
  v_started timestamptz := clock_timestamp();
BEGIN
  v_got_lock := pg_try_advisory_lock(hashtext('refresh_trending_scores'));
  IF NOT v_got_lock THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true, 'reason', 'already_running');
  END IF;

  BEGIN
    PERFORM public.calculate_product_scores();
    PERFORM pg_advisory_unlock(hashtext('refresh_trending_scores'));
    RETURN jsonb_build_object(
      'ok', true,
      'duration_ms', extract(epoch FROM (clock_timestamp() - v_started)) * 1000
    );
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_advisory_unlock(hashtext('refresh_trending_scores'));
    RAISE WARNING 'refresh_trending_scores failed: %', SQLERRM;
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_trending_scores() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_trending_scores() TO service_role;

-- Admin-callable RPC
CREATE OR REPLACE FUNCTION public.admin_refresh_trending_scores()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;
  RETURN public.refresh_trending_scores();
END;
$$;

REVOKE ALL ON FUNCTION public.admin_refresh_trending_scores() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_refresh_trending_scores() TO authenticated;

-- Schedule hourly via pg_cron (idempotent: unschedule any existing job of same name first)
DO $$
BEGIN
  PERFORM cron.unschedule('refresh-trending-scores')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-trending-scores');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'refresh-trending-scores',
  '0 * * * *',
  $cron$ SELECT public.refresh_trending_scores(); $cron$
);
