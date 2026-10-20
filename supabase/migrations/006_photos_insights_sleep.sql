-- Family member photos, personal and family recommendations, sleep from Apple Health,
-- and the first push error per broadcast.

-- ---------- Member photos ----------
alter table public.members add column if not exists photo_path text;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', false)
on conflict (id) do nothing;

drop policy if exists "avatars owner read" on storage.objects;
create policy "avatars owner read" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatars owner write" on storage.objects;
create policy "avatars owner write" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text and not public.is_banned(auth.uid()));
drop policy if exists "avatars owner update" on storage.objects;
create policy "avatars owner update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatars owner delete" on storage.objects;
create policy "avatars owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- Recommendations ----------
-- One row per member (scope 'member') and one per family (scope 'family', member_id null).
create table if not exists public.insights (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  member_id uuid references public.members (id) on delete cascade,
  scope text not null check (scope in ('member', 'family')),
  key text not null unique,
  headline text,
  items jsonb not null default '[]'::jsonb,
  based_on jsonb not null default '[]'::jsonb,
  locale text not null default 'en',
  model text,
  status text not null default 'ready' check (status in ('pending', 'ready', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists insights_owner_idx on public.insights (owner_id);
alter table public.insights enable row level security;
drop policy if exists "insights owner read" on public.insights;
create policy "insights owner read" on public.insights for select to authenticated
  using (owner_id = auth.uid() and not public.is_banned(auth.uid()));
-- Written only by the server (service role).
revoke insert, update, delete on public.insights from authenticated, anon;

-- ---------- Sleep ----------
create table if not exists public.sleep_nights (
  owner_id uuid not null references auth.users (id) on delete cascade,
  night date not null,
  asleep_min integer not null check (asleep_min between 0 and 1440),
  in_bed_min integer,
  bedtime timestamptz,
  wake_time timestamptz,
  deep_min integer,
  rem_min integer,
  awake_min integer,
  source text not null default 'apple_health',
  updated_at timestamptz not null default now(),
  primary key (owner_id, night)
);
alter table public.sleep_nights enable row level security;
drop policy if exists "sleep owner all" on public.sleep_nights;
create policy "sleep owner all" on public.sleep_nights for all to authenticated
  using (owner_id = auth.uid() and not public.is_banned(auth.uid()))
  with check (owner_id = auth.uid() and not public.is_banned(auth.uid()));

alter table public.profiles add column if not exists sleep_connected_at timestamptz;
grant update (sleep_connected_at) on public.profiles to authenticated;

-- ---------- Push diagnostics ----------
alter table public.broadcasts add column if not exists push_error text;
