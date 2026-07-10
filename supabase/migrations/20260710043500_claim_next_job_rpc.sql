-- Atomic job claiming via FOR UPDATE SKIP LOCKED
-- This RPC function atomically selects and claims the next pending job,
-- guaranteeing that no two workers can ever process the same job.

CREATE OR REPLACE FUNCTION public.claim_next_job(job_types TEXT[])
RETURNS SETOF public.agent_jobs
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  claimed_job public.agent_jobs;
BEGIN
  -- Atomically find one pending job whose next_run_at has passed,
  -- lock it exclusively (skipping any already-locked rows),
  -- transition it to 'running', and return the updated row.
  UPDATE public.agent_jobs
  SET 
    status = 'running',
    started_at = NOW(),
    updated_at = NOW()
  WHERE id = (
    SELECT id
    FROM public.agent_jobs
    WHERE status = 'pending'
      AND type = ANY(job_types)
      AND next_run_at <= NOW()
    ORDER BY next_run_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING * INTO claimed_job;

  -- If no row was found, return an empty set
  IF claimed_job.id IS NOT NULL THEN
    RETURN NEXT claimed_job;
  END IF;

  RETURN;
END;
$$;
