-- agent_jobs table
CREATE TYPE agent_job_status AS ENUM ('pending', 'running', 'completed', 'failed', 'cancelled');

CREATE TABLE public.agent_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL,
    status agent_job_status NOT NULL DEFAULT 'pending',
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    result JSONB,
    error TEXT,
    progress INTEGER NOT NULL DEFAULT 0,
    retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 3,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    next_run_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Index for pulling jobs efficiently
CREATE INDEX idx_agent_jobs_pending ON public.agent_jobs (status, next_run_at) WHERE status = 'pending';

-- Add RLS (restrict to service role)
ALTER TABLE public.agent_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service Role can manage agent_jobs" 
ON public.agent_jobs
FOR ALL 
TO service_role
USING (true)
WITH CHECK (true);

-- Updated at trigger
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.agent_jobs 
  FOR EACH ROW EXECUTE PROCEDURE moddatetime (updated_at);
