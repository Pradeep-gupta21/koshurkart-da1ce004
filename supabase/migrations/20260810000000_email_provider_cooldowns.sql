-- Create provider cooldowns table
CREATE TABLE IF NOT EXISTS public.email_provider_cooldowns (
  provider TEXT PRIMARY KEY,
  retry_after_until TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT email_provider_cooldowns_provider_check CHECK (provider IN ('brevo'))
);

-- RLS
ALTER TABLE public.email_provider_cooldowns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage provider cooldowns"
  ON public.email_provider_cooldowns FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Drop the existing function in case the return type was previously VOID,
-- because PostgreSQL does not allow changing a function's return type via REPLACE.
DROP FUNCTION IF EXISTS public.set_provider_cooldown(text, timestamptz);

-- RPC to set/upsert cooldown atomically
CREATE FUNCTION public.set_provider_cooldown(
  p_provider TEXT,
  p_retry_after_until TIMESTAMPTZ
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
-- Use SECURITY INVOKER because the caller is already the service-role worker
AS $$
DECLARE
  v_effective_cooldown TIMESTAMPTZ;
BEGIN
  -- Validate provider
  IF p_provider NOT IN ('brevo') THEN
    RAISE EXCEPTION 'Unsupported provider: %', p_provider;
  END IF;

  INSERT INTO public.email_provider_cooldowns (provider, retry_after_until, updated_at)
  VALUES (p_provider, p_retry_after_until, now())
  ON CONFLICT (provider) DO UPDATE
  SET 
    retry_after_until = GREATEST(email_provider_cooldowns.retry_after_until, EXCLUDED.retry_after_until),
    updated_at = now()
  RETURNING retry_after_until INTO v_effective_cooldown;

  RETURN v_effective_cooldown;
END;
$$;

-- Restrict execution
REVOKE ALL ON FUNCTION public.set_provider_cooldown(text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_provider_cooldown(text, timestamptz) TO service_role;
