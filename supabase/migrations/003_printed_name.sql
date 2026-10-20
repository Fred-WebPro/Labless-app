-- Keep the test name exactly as printed on the lab report; `name` holds the
-- standard name in the person's language.
alter table public.results add column if not exists printed_name text;
