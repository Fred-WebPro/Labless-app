-- Approximate location from the request IP (country, region, city), written only by the server.
alter table public.profiles add column if not exists geo_country text;
alter table public.profiles add column if not exists geo_region text;
alter table public.profiles add column if not exists geo_city text;
alter table public.profiles add column if not exists geo_at timestamptz;

-- Notification permission as the phone reports it, and the phone's own language.
alter table public.profiles add column if not exists push_status text;
alter table public.profiles add column if not exists device_language text;
grant update (push_status, device_language) on public.profiles to authenticated;
