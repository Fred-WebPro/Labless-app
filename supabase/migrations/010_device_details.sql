-- More about the phone, refreshed by the app on every open and shown in the admin panel.
alter table public.profiles add column if not exists os_version text;
alter table public.profiles add column if not exists device_brand text;
alter table public.profiles add column if not exists device_region text;
alter table public.profiles add column if not exists app_build text;
alter table public.profiles add column if not exists update_id text;
grant update (os_version, device_brand, device_region, app_build, update_id) on public.profiles to authenticated;
