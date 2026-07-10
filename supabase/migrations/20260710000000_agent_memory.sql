-- Create agent memory table for durable AI context
CREATE TABLE public.agent_memory (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    scope_level TEXT NOT NULL,
    scope_key TEXT NOT NULL,
    scope_audience TEXT,
    content JSONB NOT NULL,
    importance NUMERIC,
    tags TEXT[],
    metadata JSONB,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
);

-- Index for fast retrieval by scope, which is the primary query pattern
CREATE INDEX idx_agent_memory_scope ON public.agent_memory (scope_level, scope_key);

-- Row Level Security (RLS)
ALTER TABLE public.agent_memory ENABLE ROW LEVEL SECURITY;

-- Allow Edge Functions (service_role) to bypass RLS, but restrict anon access
CREATE POLICY "Service role has full access to agent memory"
    ON public.agent_memory
    FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');
