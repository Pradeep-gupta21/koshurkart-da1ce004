DO $$
DECLARE
  v_future_time timestamptz := now() + interval '1 day';
  v_post_reset_time timestamptz;
  v_original_retry_after_until timestamptz;
  v_original_updated_at timestamptz;
  v_original_brevo_exists boolean;
BEGIN
  -- We assume service_role execution is tested by RLS/grants;
  -- testing business logic of NULL and unsupported provider rejections.

  -- Snapshot the existing Brevo cooldown state so this test does not
  -- destroy shared database state.
  SELECT retry_after_until, updated_at
  INTO v_original_retry_after_until, v_original_updated_at
  FROM public.email_provider_cooldowns
  WHERE provider = 'brevo'
  FOR UPDATE;

  v_original_brevo_exists := FOUND;

  -- Test 1: Valid provider
  IF v_original_brevo_exists THEN
    UPDATE public.email_provider_cooldowns
    SET retry_after_until = v_future_time,
        updated_at = now()
    WHERE provider = 'brevo';
  ELSE
    INSERT INTO public.email_provider_cooldowns
      (provider, retry_after_until, updated_at)
    VALUES
      ('brevo', v_future_time, now());
  END IF;

  PERFORM public.reset_provider_cooldown('brevo');

  SELECT retry_after_until
  INTO v_post_reset_time
  FROM public.email_provider_cooldowns
  WHERE provider = 'brevo';

  IF v_post_reset_time IS NULL THEN
    RAISE EXCEPTION 'Test 1 Failed: Brevo row not found after reset';
  END IF;

  IF v_post_reset_time > now() THEN
    RAISE EXCEPTION
      'Test 1 Failed: retry_after_until is still in the future: %',
      v_post_reset_time;
  END IF;

  -- Restore the original Brevo cooldown state.
  IF v_original_brevo_exists THEN
    UPDATE public.email_provider_cooldowns
    SET retry_after_until = v_original_retry_after_until,
        updated_at = v_original_updated_at
    WHERE provider = 'brevo';
  ELSE
    DELETE FROM public.email_provider_cooldowns
    WHERE provider = 'brevo';
  END IF;

  -- Test 2: Unsupported provider
  BEGIN
    PERFORM public.reset_provider_cooldown('lovable');
    RAISE EXCEPTION 'ASSERTION_FAILED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'ASSERTION_FAILED' THEN
      RAISE EXCEPTION 'Test 2 Failed: Did not reject unsupported provider';
    ELSIF SQLERRM NOT LIKE 'Unsupported provider%' THEN
      RAISE EXCEPTION 'Test 2 Failed: Wrong error message: %', SQLERRM;
    END IF;
  END;

  -- Test 3: NULL provider
  BEGIN
    PERFORM public.reset_provider_cooldown(NULL);
    RAISE EXCEPTION 'ASSERTION_FAILED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'ASSERTION_FAILED' THEN
      RAISE EXCEPTION 'Test 3 Failed: Did not reject NULL provider';
    ELSIF SQLERRM NOT LIKE 'Unsupported provider%' THEN
      RAISE EXCEPTION 'Test 3 Failed: Wrong error message: %', SQLERRM;
    END IF;
  END;

  RAISE NOTICE 'All tests passed.';
END;
$$;