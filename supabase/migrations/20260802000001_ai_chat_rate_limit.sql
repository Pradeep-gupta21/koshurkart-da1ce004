-- Audit C-3: AI chat rate limiter (sliding window, per user).
-- Mirrors the existing checkout_rate_limit pattern.
-- Allows 20 AI chat requests per minute per user.
create or replace function public.ai_chat_rate_limit(_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cnt int;
begin
  select count(*) into cnt
  from public.analytics_events
  where user_id = _user_id
    and event_type = 'ai_chat_attempt'
    and created_at > now() - interval '1 minute';
  return cnt < 20;
end;
$$;

-- Grant to service_role only (edge functions use service client)
REVOKE EXECUTE ON FUNCTION public.ai_chat_rate_limit(uuid) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.ai_chat_rate_limit(uuid) TO service_role;
