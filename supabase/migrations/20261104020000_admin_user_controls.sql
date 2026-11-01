-- =====================================================================
-- Vatican Cake Point: admin user controls and moderation RPCs
-- Run AFTER 20261104010000_admin_profile_backfill.sql
-- =====================================================================

-- Moderation columns used by the admin user management screen.
alter table public.profiles
  add column if not exists warning_flag boolean not null default false,
  add column if not exists warning_count integer not null default 0,
  add column if not exists last_warned_at timestamptz,
  add column if not exists warning_note text,
  add column if not exists is_suspended boolean not null default false,
  add column if not exists suspended_at timestamptz,
  add column if not exists suspension_reason text;

-- Warn a user account and track moderation metadata.
create or replace function public.admin_warn_user(p_user_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'You do not have permission to do this.';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'You cannot warn your own account.';
  end if;

  update public.profiles
     set warning_flag = true,
         warning_count = coalesce(warning_count, 0) + 1,
         last_warned_at = now(),
         warning_note = coalesce(nullif(trim(p_note), ''), warning_note)
   where id = p_user_id;

  if not found then
    raise exception 'Profile not found.';
  end if;
end;
$$;

revoke all on function public.admin_warn_user(uuid, text) from public, anon;
grant execute on function public.admin_warn_user(uuid, text) to authenticated;

-- Suspend or unsuspend a user account.
create or replace function public.admin_set_user_suspension(
  p_user_id uuid,
  p_suspend boolean,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'You do not have permission to do this.';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'You cannot suspend your own account.';
  end if;

  update public.profiles
     set is_suspended = p_suspend,
         suspended_at = case when p_suspend then now() else null end,
         suspension_reason = case
           when p_suspend then coalesce(nullif(trim(p_reason), ''), suspension_reason)
           else null
         end
   where id = p_user_id;

  if not found then
    raise exception 'Profile not found.';
  end if;
end;
$$;

revoke all on function public.admin_set_user_suspension(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_user_suspension(uuid, boolean, text) to authenticated;
