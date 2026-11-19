-- =====================================================================
-- Vatican Cake Point: Nova assistant
-- Run in the Supabase SQL Editor (any time after the earlier migrations).
--
-- One row per question a customer asks Nova. The Edge Function counts
-- recent rows to enforce an hourly limit, which keeps your AI bill safe.
-- Only the service role (the Edge Function) can read or write it.
-- =====================================================================

create table if not exists public.nova_requests (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists nova_requests_user_created_idx
  on public.nova_requests (user_id, created_at desc);

-- RLS on with NO policies = no access from the app at all
alter table public.nova_requests enable row level security;

-- Housekeeping: rows older than a day are useless. Run this occasionally
-- (or schedule it with pg_cron):
--   delete from public.nova_requests where created_at < now() - interval '1 day';
