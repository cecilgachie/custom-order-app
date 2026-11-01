-- =====================================================================
-- Vatican Cake Point: admin dashboard hardening
-- Run AFTER 20261103000000_admin_orders.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Complaint table + policies (if not already present)
-- ---------------------------------------------------------------------
create table if not exists public.customer_complaints (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid references auth.users (id) on delete set null,
  complaint_category text not null,
  complaint_body     text not null,
  resolution_status  text not null default 'Open'
                     check (resolution_status in ('Open', 'Investigating', 'Resolved')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists customer_complaints_user_created_idx
  on public.customer_complaints (user_id, created_at desc);

alter table public.customer_complaints enable row level security;

drop policy if exists "Users read own complaints" on public.customer_complaints;
create policy "Users read own complaints"
  on public.customer_complaints for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users create own complaints" on public.customer_complaints;
create policy "Users create own complaints"
  on public.customer_complaints for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Admins read all complaints" on public.customer_complaints;
create policy "Admins read all complaints"
  on public.customer_complaints for select to authenticated
  using (public.is_admin());

drop policy if exists "Admins update complaints" on public.customer_complaints;
create policy "Admins update complaints"
  on public.customer_complaints for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Keep updated_at current for complaint changes.
create or replace function public.touch_customer_complaints_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists touch_customer_complaints_updated_at on public.customer_complaints;
create trigger touch_customer_complaints_updated_at
  before update on public.customer_complaints
  for each row execute function public.touch_customer_complaints_updated_at();

-- ---------------------------------------------------------------------
-- 2. Admin ledger summary view used by admin dashboard
-- ---------------------------------------------------------------------
drop view if exists public.view_admin_ledger_summary;

create or replace view public.view_admin_ledger_summary
with (security_invoker = true)
as
select
  coalesce(sum(case when coalesce(order_status, 'Pending Review') <> 'Cancelled' then total_price else 0 end), 0)::bigint as total_accrued_revenue,
  coalesce(sum(case when coalesce(order_status, 'Pending Review') <> 'Cancelled' then amount_paid else 0 end), 0)::bigint as total_collected,
  coalesce(sum(case when coalesce(order_status, 'Pending Review') <> 'Cancelled' then greatest(total_price - amount_paid, 0) else 0 end), 0)::bigint as outstanding_balances
from public.cake_orders;

grant select on public.view_admin_ledger_summary to authenticated;

-- ---------------------------------------------------------------------
-- 3. Seed admin role for a known email (safe no-op if user/profile missing)
-- ---------------------------------------------------------------------
do $$
declare
  v_email   text := 'mwangimwangifrancis94@gmail.com';
  v_user_id uuid;
begin
  select u.id
    into v_user_id
  from auth.users u
  where lower(u.email) = lower(v_email)
  limit 1;

  if v_user_id is null then
    raise notice 'Admin seed skipped: no auth.users row found for %.', v_email;
    return;
  end if;

  update public.profiles p
     set system_role = 'System_Admin'
   where p.id = v_user_id;

  if not found then
    raise notice 'Admin seed partial: auth user exists, but profiles row missing for %.', v_email;
  else
    raise notice 'Admin seed success: % promoted to System_Admin.', v_email;
  end if;
end
$$;
