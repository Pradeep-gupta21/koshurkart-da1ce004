-- Operational recovery path for stuck or accidentally excessive provider cooldowns
CREATE FUNCTION public.reset_provider_cooldown(p_provider TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_provider IS DISTINCT FROM 'brevo' THEN
    RAISE EXCEPTION 'Unsupported provider: %', p_provider;
  END IF;

  UPDATE public.email_provider_cooldowns
  SET retry_after_until = now(),
      updated_at = now()
  WHERE provider = p_provider;
END;
$$;

-- Restrict execution to service_role (operational admin task)
REVOKE ALL ON FUNCTION public.reset_provider_cooldown(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_provider_cooldown(text) TO service_role;
