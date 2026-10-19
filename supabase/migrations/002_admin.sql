-- Aggregations for the admin panel. Callable only with the service role.

create or replace function public.admin_daily(p_days integer default 30)
returns table (
  day date,
  new_users bigint,
  active_users bigint,
  reports bigint,
  ready bigint,
  failed bigint,
  events bigint
)
language sql stable security definer set search_path = public as $$
  with days as (
    select generate_series((current_date - (p_days - 1)), current_date, interval '1 day')::date as day
  )
  select
    d.day,
    (select count(*) from profiles p where p.created_at::date = d.day),
    (select count(distinct e.user_id) from events e where e.created_at::date = d.day),
    (select count(*) from reports r where r.created_at::date = d.day),
    (select count(*) from reports r where r.created_at::date = d.day and r.status = 'ready'),
    (select count(*) from reports r where r.created_at::date = d.day and r.status = 'failed'),
    (select count(*) from events e where e.created_at::date = d.day)
  from days d
  order by d.day;
$$;

create or replace function public.admin_totals()
returns table (
  users bigint,
  users_7d bigint,
  dau bigint,
  wau bigint,
  mau bigint,
  members bigint,
  reports bigint,
  reports_ready bigint,
  reports_failed bigint,
  reports_processing bigint,
  avg_processing_ms numeric,
  push_tokens bigint,
  broadcasts bigint
)
language sql stable security definer set search_path = public as $$
  select
    (select count(*) from profiles),
    (select count(*) from profiles where created_at > now() - interval '7 days'),
    (select count(distinct user_id) from events where created_at > now() - interval '1 day'),
    (select count(distinct user_id) from events where created_at > now() - interval '7 days'),
    (select count(distinct user_id) from events where created_at > now() - interval '30 days'),
    (select count(*) from members),
    (select count(*) from reports),
    (select count(*) from reports where status = 'ready'),
    (select count(*) from reports where status = 'failed'),
    (select count(*) from reports where status in ('uploaded', 'processing')),
    (select round(avg(processing_ms)) from reports where status = 'ready' and processing_ms is not null),
    (select count(*) from push_tokens where not disabled),
    (select count(*) from broadcasts);
$$;

create or replace function public.admin_breakdown()
returns table (kind text, label text, value bigint)
language sql stable security definer set search_path = public as $$
  select 'platform', coalesce(platform, 'unknown'), count(*) from profiles group by 2
  union all
  select 'locale', coalesce(locale, 'unknown'), count(*) from profiles group by 2
  union all
  select 'event', name, count(*) from events where created_at > now() - interval '30 days' group by 2
  union all
  select 'relation', relation, count(*) from members group by 2;
$$;

create or replace function public.admin_user_stats()
returns table (
  user_id uuid,
  members bigint,
  reports bigint,
  events_30d bigint,
  sessions_30d bigint,
  last_event_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    p.id,
    (select count(*) from members m where m.owner_id = p.id),
    (select count(*) from reports r where r.owner_id = p.id),
    (select count(*) from events e where e.user_id = p.id and e.created_at > now() - interval '30 days'),
    (select count(*) from events e where e.user_id = p.id and e.name = 'app_open' and e.created_at > now() - interval '30 days'),
    (select max(e.created_at) from events e where e.user_id = p.id)
  from profiles p;
$$;

revoke all on function public.admin_daily(integer) from public, anon, authenticated;
revoke all on function public.admin_totals() from public, anon, authenticated;
revoke all on function public.admin_breakdown() from public, anon, authenticated;
revoke all on function public.admin_user_stats() from public, anon, authenticated;
grant execute on function public.admin_daily(integer) to service_role;
grant execute on function public.admin_totals() to service_role;
grant execute on function public.admin_breakdown() to service_role;
grant execute on function public.admin_user_stats() to service_role;
