-- AI cost tracking, account bans, admin notes and an audit log of admin actions.

create table if not exists public.ai_usage (
  id bigserial primary key,
  user_id uuid references auth.users (id) on delete set null,
  report_id uuid references public.reports (id) on delete set null,
  kind text not null,
  model text not null,
  speed text not null default 'standard',
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  cache_write_tokens integer not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  duration_ms integer,
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_user_idx on public.ai_usage (user_id, created_at desc);
create index if not exists ai_usage_created_idx on public.ai_usage (created_at desc);
create index if not exists ai_usage_report_idx on public.ai_usage (report_id);
alter table public.ai_usage enable row level security;

alter table public.profiles add column if not exists banned_at timestamptz;
alter table public.profiles add column if not exists ban_reason text;
alter table public.profiles add column if not exists admin_note text;

create table if not exists public.admin_actions (
  id bigserial primary key,
  admin_id uuid references auth.users (id) on delete set null,
  target_user uuid,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists admin_actions_target_idx on public.admin_actions (target_user, created_at desc);
alter table public.admin_actions enable row level security;

-- Banned accounts can't write anything through the API surface the app uses directly.
create or replace function public.is_banned(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = uid and banned_at is not null);
$$;

drop policy if exists members_all on public.members;
create policy members_all on public.members for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid() and not public.is_banned(auth.uid()));
drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports for insert to authenticated
  with check (owner_id = auth.uid() and status = 'uploaded' and not public.is_banned(auth.uid()));
drop policy if exists reports_files_insert on storage.objects;
create policy reports_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'reports' and (storage.foldername(name))[1] = auth.uid()::text and not public.is_banned(auth.uid()));

-- Aggregates now include AI spend.
drop function if exists public.admin_totals();
create or replace function public.admin_totals()
returns table (
  users bigint, users_7d bigint, dau bigint, wau bigint, mau bigint, members bigint,
  reports bigint, reports_ready bigint, reports_failed bigint, reports_processing bigint,
  avg_processing_ms numeric, push_tokens bigint, broadcasts bigint, banned bigint,
  ai_cost_total numeric, ai_cost_30d numeric, ai_cost_today numeric, ai_cost_per_report numeric
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
    (select count(*) from broadcasts),
    (select count(*) from profiles where banned_at is not null),
    (select coalesce(sum(cost_usd), 0) from ai_usage),
    (select coalesce(sum(cost_usd), 0) from ai_usage where created_at > now() - interval '30 days'),
    (select coalesce(sum(cost_usd), 0) from ai_usage where created_at::date = current_date),
    (select coalesce(sum(cost_usd), 0) / nullif(count(distinct report_id), 0) from ai_usage where report_id is not null);
$$;

drop function if exists public.admin_daily(integer);
create or replace function public.admin_daily(p_days integer default 30)
returns table (day date, new_users bigint, active_users bigint, reports bigint, ready bigint, failed bigint, events bigint, ai_cost numeric)
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
    (select count(*) from events e where e.created_at::date = d.day),
    (select coalesce(sum(a.cost_usd), 0) from ai_usage a where a.created_at::date = d.day)
  from days d
  order by d.day;
$$;

drop function if exists public.admin_user_stats();
create or replace function public.admin_user_stats()
returns table (user_id uuid, members bigint, reports bigint, events_30d bigint, sessions_30d bigint, last_event_at timestamptz, ai_cost numeric, active_days bigint)
language sql stable security definer set search_path = public as $$
  select
    p.id,
    (select count(*) from members m where m.owner_id = p.id),
    (select count(*) from reports r where r.owner_id = p.id),
    (select count(*) from events e where e.user_id = p.id and e.created_at > now() - interval '30 days'),
    (select count(*) from events e where e.user_id = p.id and e.name = 'app_open' and e.created_at > now() - interval '30 days'),
    (select max(e.created_at) from events e where e.user_id = p.id),
    (select coalesce(sum(a.cost_usd), 0) from ai_usage a where a.user_id = p.id),
    (select count(distinct e.created_at::date) from events e where e.user_id = p.id)
  from profiles p;
$$;

revoke all on function public.admin_daily(integer) from public, anon, authenticated;
revoke all on function public.admin_totals() from public, anon, authenticated;
revoke all on function public.admin_user_stats() from public, anon, authenticated;
grant execute on function public.admin_daily(integer) to service_role;
grant execute on function public.admin_totals() to service_role;
grant execute on function public.admin_user_stats() to service_role;
