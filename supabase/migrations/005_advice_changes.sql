-- Health advice and the change summary against earlier reports, both produced in the same interpretation call.
alter table public.analyses add column if not exists advice jsonb not null default '[]'::jsonb;
alter table public.analyses add column if not exists changes jsonb not null default '[]'::jsonb;
