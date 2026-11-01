-- =====================================================================
-- Vatican Cake Point: ensure seeded admin has a profile row + role
-- Run AFTER 20261104000000_admin_dashboard_hardening.sql
-- =====================================================================

do $$
declare
  v_email text := 'mwangimwangifrancis94@gmail.com';
  v_user_id uuid;
begin
  select u.id
    into v_user_id
  from auth.users u
  where lower(u.email) = lower(v_email)
  limit 1;

  if v_user_id is null then
    raise notice 'Admin profile backfill skipped: no auth.users row for %.', v_email;
    return;
  end if;

  update public.profiles
     set system_role = 'System_Admin'
   where id = v_user_id;

  if not found then
    insert into public.profiles (id, system_role)
    values (v_user_id, 'System_Admin');
    raise notice 'Admin profile backfill success: created profile for %.', v_email;
  else
    raise notice 'Admin profile backfill success: updated existing profile for %.', v_email;
  end if;
end
$$;
