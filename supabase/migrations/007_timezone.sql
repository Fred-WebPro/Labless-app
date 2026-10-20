-- The phone's time zone, so bedtimes from Apple Health read as local clock time.
alter table public.profiles add column if not exists timezone text;
grant update (timezone) on public.profiles to authenticated;
