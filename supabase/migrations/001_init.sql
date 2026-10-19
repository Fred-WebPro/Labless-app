-- Labless core schema.
-- Every user-owned row carries owner_id and is protected by row level security.
-- The admin panel and API use the service role, which bypasses RLS.

create extension if not exists pgcrypto;

-- ---------- Profiles ----------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  locale text not null default 'en',
  role text not null default 'user' check (role in ('user', 'admin')),
  onboarded boolean not null default false,
  notifications_enabled boolean not null default true,
  platform text,
  app_version text,
  device_model text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- Families and members ----------

create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null default 'My family',
  created_at timestamptz not null default now()
);
create index if not exists families_owner_idx on public.families (owner_id);

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  relation text not null default 'self'
    check (relation in ('self', 'partner', 'child', 'parent', 'sibling', 'grandparent', 'other')),
  sex text check (sex in ('male', 'female')),
  birth_date date,
  color text not null default '#D2261C',
  is_self boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists members_owner_idx on public.members (owner_id);
create index if not exists members_family_idx on public.members (family_id);

-- ---------- Reports, results, analyses ----------

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  status text not null default 'uploaded'
    check (status in ('uploaded', 'processing', 'ready', 'failed')),
  stage text,
  files jsonb not null default '[]'::jsonb,
  title text,
  lab_name text,
  collected_at date,
  error text,
  processing_ms integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists reports_owner_idx on public.reports (owner_id, created_at desc);
create index if not exists reports_member_idx on public.reports (member_id, created_at desc);

create table if not exists public.results (
  id bigserial primary key,
  report_id uuid not null references public.reports (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  marker text not null,
  name text not null,
  category text,
  value numeric,
  value_text text,
  unit text,
  ref_low numeric,
  ref_high numeric,
  ref_text text,
  flag text check (flag in ('low', 'high', 'normal', 'critical_low', 'critical_high') or flag is null),
  collected_at date,
  created_at timestamptz not null default now()
);
create index if not exists results_member_marker_idx on public.results (member_id, marker, collected_at);
create index if not exists results_report_idx on public.results (report_id);

create table if not exists public.analyses (
  report_id uuid primary key references public.reports (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  status text,
  summary text,
  findings jsonb not null default '[]'::jsonb,
  hidden_tests jsonb not null default '[]'::jsonb,
  indices jsonb not null default '[]'::jsonb,
  next_steps jsonb not null default '[]'::jsonb,
  skip_tests jsonb not null default '[]'::jsonb,
  doctor_questions jsonb not null default '[]'::jsonb,
  checkin_questions jsonb not null default '[]'::jsonb,
  checkin_answers jsonb not null default '{}'::jsonb,
  red_flags jsonb not null default '[]'::jsonb,
  locale text,
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists analyses_member_idx on public.analyses (member_id);

-- ---------- Analytics and notifications ----------

create table if not exists public.events (
  id bigserial primary key,
  user_id uuid references auth.users (id) on delete cascade,
  name text not null check (char_length(name) <= 64),
  props jsonb not null default '{}'::jsonb,
  platform text,
  app_version text,
  session_id text,
  created_at timestamptz not null default now()
);
create index if not exists events_created_idx on public.events (created_at desc);
create index if not exists events_user_idx on public.events (user_id, created_at desc);
create index if not exists events_name_idx on public.events (name, created_at desc);

create table if not exists public.push_tokens (
  token text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text,
  device_name text,
  disabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_tokens_user_idx on public.push_tokens (user_id);

create table if not exists public.broadcasts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  audience jsonb not null default '{"type":"all"}'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  status text not null default 'sending' check (status in ('sending', 'sent', 'failed')),
  recipients integer not null default 0,
  push_sent integer not null default 0,
  push_failed integer not null default 0,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create table if not exists public.inbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  broadcast_id uuid references public.broadcasts (id) on delete set null,
  kind text not null default 'broadcast',
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists inbox_user_idx on public.inbox (user_id, created_at desc);

-- ---------- updated_at ----------

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists members_touch on public.members;
create trigger members_touch before update on public.members
  for each row execute function public.touch_updated_at();
drop trigger if exists reports_touch on public.reports;
create trigger reports_touch before update on public.reports
  for each row execute function public.touch_updated_at();
drop trigger if exists analyses_touch on public.analyses;
create trigger analyses_touch before update on public.analyses
  for each row execute function public.touch_updated_at();

-- ---------- New user bootstrap: profile + family ----------

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, locale)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'locale', ''), 'en')
  )
  on conflict (id) do nothing;

  insert into public.families (owner_id, name)
  select new.id, 'My family'
  where not exists (select 1 from public.families where owner_id = new.id);

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Members must belong to a family the same user owns.
create or replace function public.check_member_family() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.families f where f.id = new.family_id and f.owner_id = new.owner_id) then
    raise exception 'family does not belong to owner';
  end if;
  return new;
end $$;

drop trigger if exists members_family_check on public.members;
create trigger members_family_check before insert or update on public.members
  for each row execute function public.check_member_family();

-- Reports must point at a member the same user owns.
create or replace function public.check_report_member() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.members m where m.id = new.member_id and m.owner_id = new.owner_id) then
    raise exception 'member does not belong to owner';
  end if;
  return new;
end $$;

drop trigger if exists reports_member_check on public.reports;
create trigger reports_member_check before insert or update on public.reports
  for each row execute function public.check_report_member();

-- ---------- Row level security ----------

alter table public.profiles enable row level security;
alter table public.families enable row level security;
alter table public.members enable row level security;
alter table public.reports enable row level security;
alter table public.results enable row level security;
alter table public.analyses enable row level security;
alter table public.events enable row level security;
alter table public.push_tokens enable row level security;
alter table public.broadcasts enable row level security;
alter table public.inbox enable row level security;

-- profiles: read and edit your own row; role can't be changed by the client.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (id = auth.uid());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated;
grant update (full_name, locale, onboarded, notifications_enabled, platform, app_version, device_model, last_seen_at)
  on public.profiles to authenticated;

-- families
drop policy if exists families_all on public.families;
create policy families_all on public.families for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- members
drop policy if exists members_all on public.members;
create policy members_all on public.members for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- reports: the client creates and deletes; processing fields are written by the API.
drop policy if exists reports_select on public.reports;
create policy reports_select on public.reports for select to authenticated using (owner_id = auth.uid());
drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports for insert to authenticated
  with check (owner_id = auth.uid() and status = 'uploaded');
drop policy if exists reports_update on public.reports;
create policy reports_update on public.reports for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
revoke update on public.reports from authenticated;
grant update (title, collected_at, member_id) on public.reports to authenticated;
drop policy if exists reports_delete on public.reports;
create policy reports_delete on public.reports for delete to authenticated using (owner_id = auth.uid());

-- results and analyses: read-only for the owner.
drop policy if exists results_select on public.results;
create policy results_select on public.results for select to authenticated using (owner_id = auth.uid());
drop policy if exists analyses_select on public.analyses;
create policy analyses_select on public.analyses for select to authenticated using (owner_id = auth.uid());

-- events: write-only for the signed-in user.
drop policy if exists events_insert on public.events;
create policy events_insert on public.events for insert to authenticated with check (user_id = auth.uid());

-- push tokens
drop policy if exists push_tokens_all on public.push_tokens;
create policy push_tokens_all on public.push_tokens for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- inbox: read and mark as read.
drop policy if exists inbox_select on public.inbox;
create policy inbox_select on public.inbox for select to authenticated using (user_id = auth.uid());
drop policy if exists inbox_update on public.inbox;
create policy inbox_update on public.inbox for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists inbox_delete on public.inbox;
create policy inbox_delete on public.inbox for delete to authenticated using (user_id = auth.uid());
revoke update on public.inbox from authenticated;
grant update (read_at) on public.inbox to authenticated;

-- broadcasts: no client access (service role only).

-- ---------- Storage: private bucket for report files ----------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('reports', 'reports', false, 20971520,
        array['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp', 'application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists reports_files_select on storage.objects;
create policy reports_files_select on storage.objects for select to authenticated
  using (bucket_id = 'reports' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists reports_files_insert on storage.objects;
create policy reports_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'reports' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists reports_files_delete on storage.objects;
create policy reports_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'reports' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- Realtime for live report status ----------

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reports'
  ) then
    alter publication supabase_realtime add table public.reports;
  end if;
exception when undefined_object then
  null;
end $$;
