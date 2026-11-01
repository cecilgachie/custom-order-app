-- =====================================================================
-- Vatican Cake Point: admin order management
-- Run AFTER 20261102000000_orders_receipts_notifications.sql
--
-- Staff change order stages and record cash balances through the two
-- functions below, never by editing rows directly. That keeps the rules
-- (what may move where, what must be paid first) in the database, and
-- every stage change is written to an audit log.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Payments can now be cash as well as M-Pesa
-- ---------------------------------------------------------------------
alter table public.payments
  add column if not exists method text not null default 'M-Pesa'
  check (method in ('M-Pesa', 'Cash'));

-- ---------------------------------------------------------------------
-- 2. Staff can read every order and profile (customers still see only their own)
-- ---------------------------------------------------------------------
drop policy if exists "Admins read all orders" on public.cake_orders;
create policy "Admins read all orders"
  on public.cake_orders for select to authenticated
  using (public.is_admin());

drop policy if exists "Admins read all profiles" on public.profiles;
create policy "Admins read all profiles"
  on public.profiles for select to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------
-- 3. Audit log of stage changes
-- ---------------------------------------------------------------------
create table if not exists public.order_status_log (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.cake_orders (id) on delete cascade,
  from_status text,
  to_status   text not null,
  changed_by  uuid references auth.users (id),
  created_at  timestamptz not null default now()
);

create index if not exists order_status_log_order_idx on public.order_status_log (order_id, created_at desc);

alter table public.order_status_log enable row level security;

drop policy if exists "Admins read order log" on public.order_status_log;
create policy "Admins read order log"
  on public.order_status_log for select to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------
-- 4. Change an order's stage (staff only)
--    Rules: valid stages only, no changes after Delivered/Cancelled,
--    unpaid orders can only be cancelled, and an order can only be
--    marked Delivered once it is fully paid.
--    (The customer notification is sent by the notify_order_status trigger.)
-- ---------------------------------------------------------------------
create or replace function public.admin_set_order_status(p_order_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.cake_orders%rowtype;
begin
  if not public.is_admin() then
    raise exception 'You do not have permission to do this.';
  end if;

  if p_status not in ('Pending Review', 'Confirmed', 'Baking', 'Ready', 'Delivered', 'Cancelled') then
    raise exception 'Unknown order stage: %', p_status;
  end if;

  select * into o from public.cake_orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found.';
  end if;

  if o.order_status = p_status then
    return; -- nothing to do
  end if;

  if o.order_status in ('Delivered', 'Cancelled') then
    raise exception 'This order is already %, so it cannot be changed.', lower(o.order_status);
  end if;

  if o.payment_status = 'Unpaid' and p_status <> 'Cancelled' then
    raise exception 'This order has not been paid yet.';
  end if;

  if p_status = 'Delivered' and o.payment_status <> 'Paid' then
    raise exception 'Collect the outstanding balance before marking this order delivered.';
  end if;

  update public.cake_orders set order_status = p_status where id = p_order_id;

  insert into public.order_status_log (order_id, from_status, to_status, changed_by)
  values (p_order_id, o.order_status, p_status, auth.uid());
end;
$$;

revoke all on function public.admin_set_order_status(uuid, text) from public, anon;
grant execute on function public.admin_set_order_status(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Record a cash balance collected by staff (e.g. on delivery)
--    Creates a normal payment row with a receipt number, so the customer
--    gets the same downloadable receipt as for an M-Pesa payment.
-- ---------------------------------------------------------------------
create or replace function public.admin_record_cash_payment(p_order_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  o       public.cake_orders%rowtype;
  balance integer;
  rcpt    text;
begin
  if not public.is_admin() then
    raise exception 'You do not have permission to do this.';
  end if;

  select * into o from public.cake_orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found.';
  end if;

  if o.order_status = 'Cancelled' then
    raise exception 'This order was cancelled.';
  end if;

  if o.payment_status <> 'Deposit Paid' then
    raise exception 'This order has no deposit balance to collect.';
  end if;

  balance := o.total_price::integer - o.amount_paid;
  if balance <= 0 then
    raise exception 'There is nothing left to collect on this order.';
  end if;

  rcpt := 'RCT-' || to_char(now() at time zone 'Africa/Nairobi', 'YYMMDD')
          || '-' || lpad(nextval('public.receipt_number_seq')::text, 5, '0');

  insert into public.payments (user_id, order_ids, phone, amount, status, purpose, method, receipt_number, result_desc)
  values (o.user_id, array[o.id], 'CASH', balance, 'Success', 'Balance', 'Cash', rcpt, 'Cash collected by staff');

  update public.cake_orders
  set payment_status = 'Paid', amount_paid = o.total_price::integer
  where id = o.id;

  insert into public.notifications (user_id, title, body, kind, order_id)
  values (
    o.user_id,
    'Balance received',
    format('We received KES %s in cash for %s (%s). Receipt %s.',
           to_char(balance, 'FM999,999,999'), o.cake_title, o.order_number, rcpt),
    'payment',
    o.id
  );

  return rcpt;
end;
$$;

revoke all on function public.admin_record_cash_payment(uuid) from public, anon;
grant execute on function public.admin_record_cash_payment(uuid) to authenticated;
