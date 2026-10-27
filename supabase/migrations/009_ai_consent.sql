-- When the person agreed that their reports are processed by an external AI provider.
-- Null means no consent: the API refuses to analyze until it is given.
alter table public.profiles add column if not exists ai_consent_at timestamptz;
grant update (ai_consent_at) on public.profiles to authenticated;
