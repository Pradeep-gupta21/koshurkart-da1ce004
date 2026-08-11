-- ============================================================================
-- Migration: Create agent_jobs table
-- Description: Queue table for AI agent jobs
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Enum
-- ---------------------------------------------------------------------------

CREATE TYPE agent_job_status AS ENUM (
    'pending',
    'running',
    'completed',
    'failed',
    'cancelled'
);

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

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

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Index
-- ---------------------------------------------------------------------------

CREATE INDEX idx_agent_jobs_pending
ON public.agent_jobs (status, next_run_at)
WHERE status = 'pending';

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE public.agent_jobs
ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service Role can manage agent_jobs"
ON public.agent_jobs
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Generic updated_at trigger function
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Trigger
-- ---------------------------------------------------------------------------

CREATE TRIGGER handle_updated_at
BEFORE UPDATE
ON public.agent_jobs
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();