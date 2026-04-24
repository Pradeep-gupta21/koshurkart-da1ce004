create or replace function public.checkout_rate_limit(_user_id uuid)
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
    and event_type = 'checkout_attempt'
    and created_at > now() - interval '1 minute';
  return cnt < 10;
end;
$$;

create or replace function public.quote_rate_limit(_user_id uuid)
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
    and event_type = 'quote_attempt'
    and created_at > now() - interval '1 minute';
  return cnt < 30;
end;
$$;

create index if not exists idx_analytics_events_user_type_time
  on public.analytics_events (user_id, event_type, created_at desc);
