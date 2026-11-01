-- =====================================================================
-- Vatican Cake Point: order numbers, receipts, balance payments, notifications
-- Run AFTER 20261101000000_mpesa_payments.sql
--
-- ASSUMPTIONS:
--   * cake_orders.order_status uses these stages (edit the CASE below to match):
--       Pending Review -> Confirmed -> Baking -> Ready -> Delivered   (or Cancelled)
--   * customer_complaints has user_id, complaint_category, resolution_status
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Unique, human-friendly order numbers:  VCP-261102-00042
--    Assigned by the database, so the app can never fake or duplicate one.
-- ---------------------------------------------------------------------
alter table public.cake_orders
  add column if not exists created_at timestamptz not null default now();

create sequence if not exists public.order_number_seq;

alter table public.cake_orders add column if not exists order_number text;

-- Backfill orders that already exist
update public.cake_orders
set order_number = 'VCP-' || to_char(created_at at time zone 'Africa/Nairobi', 'YYMMDD')
                   || '-' || lpad(nextval('public.order_number_seq')::text, 5, '0')
where order_number is null;

create unique index if not exists cake_orders_order_number_key on public.cake_orders (order_number);

create or replace function public.cake_orders_assign_order_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.order_number := 'VCP-' || to_char(now() at time zone 'Africa/Nairobi', 'YYMMDD')
                        || '-' || lpad(nextval('public.order_number_seq')::text, 5, '0');
  else
    new.order_number := old.order_number; -- immutable once issued
  end if;
  return new;
end;
$$;

drop trigger if exists cake_orders_assign_order_number on public.cake_orders;
create trigger cake_orders_assign_order_number
  before insert or update on public.cake_orders
  for each row execute function public.cake_orders_assign_order_number();

-- ---------------------------------------------------------------------
-- 2. Payments: receipt numbers and payment purpose (checkout vs balance)
-- ---------------------------------------------------------------------
create sequence if not exists public.receipt_number_seq;

alter table public.payments add column if not exists receipt_number text unique;
alter table public.payments
  add column if not exists purpose text not null default 'Checkout'
  check (purpose in ('Checkout', 'Balance'));

-- ---------------------------------------------------------------------
-- 3. Notifications (written by triggers, read by the app)
-- ---------------------------------------------------------------------
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  title       text not null,
  body        text not null,
  kind        text not null default 'info',
  order_id    uuid,
  payment_id  uuid,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists notifications_user_created_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "Users read own notifications" on public.notifications;
create policy "Users read own notifications"
  on public.notifications for select to authenticated
  using (user_id = auth.uid());

-- Customers can only mark their own notifications read, through this function
create or replace function public.mark_notifications_read()
returns void
language sql
security definer
set search_path = public
as $$
  update public.notifications set read_at = now()
  where user_id = auth.uid() and read_at is null;
$$;
revoke all on function public.mark_notifications_read() from public, anon;
grant execute on function public.mark_notifications_read() to authenticated;

-- Live updates for the app's notification bell
do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null;
end $$;

-- 3a. Order stage changes
create or replace function public.notify_order_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  headline text;
  extra    text := '';
begin
  if new.order_status is distinct from old.order_status then
    headline := case new.order_status
      when 'Confirmed' then 'Order confirmed'
      when 'Baking'    then 'Your cake is in the oven'
      when 'Ready'     then 'Your cake is ready'
      when 'Delivered' then 'Order delivered'
      when 'Cancelled' then 'Order cancelled'
      else 'Order update'
    end;

    if new.order_status = 'Ready' and new.payment_status = 'Deposit Paid' then
      extra := ' Balance of KES '
               || to_char((new.total_price - new.amount_paid)::bigint, 'FM999,999,999') || ' is due.';
    end if;

    insert into public.notifications (user_id, title, body, kind, order_id)
    values (
      new.user_id,
      headline,
      format('%s (%s) is now: %s.%s', new.cake_title, new.order_number, new.order_status, extra),
      'order',
      new.id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists notify_order_status on public.cake_orders;
create trigger notify_order_status
  after update of order_status on public.cake_orders
  for each row execute function public.notify_order_status();

-- 3b. Complaint progress
create or replace function public.notify_complaint_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is not null and new.resolution_status is distinct from old.resolution_status then
    insert into public.notifications (user_id, title, body, kind)
    values (
      new.user_id,
      'Complaint update',
      format('Your complaint about "%s" is now %s.', new.complaint_category, new.resolution_status),
      'complaint'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists notify_complaint_status on public.customer_complaints;
create trigger notify_complaint_status
  after update of resolution_status on public.customer_complaints
  for each row execute function public.notify_complaint_status();

-- ---------------------------------------------------------------------
-- 4. Settlement v2: handles balance payments, issues the receipt number,
--    and notifies the customer. Replaces the version from migration 1.
-- ---------------------------------------------------------------------
create or replace function public.settle_mpesa_payment(
  p_checkout_request_id text,
  p_result_code         integer,
  p_result_desc         text,
  p_receipt             text,
  p_paid_amount         numeric,
  p_raw                 jsonb
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  pay         public.payments%rowtype;
  new_status  text;
  new_receipt text;
begin
  select * into pay
  from public.payments
  where checkout_request_id = p_checkout_request_id
  for update;

  if not found then return 'unknown'; end if;
  if pay.status <> 'Pending' then return 'duplicate'; end if;

  if p_result_code = 0 then
    if p_paid_amount is not null and p_paid_amount <> pay.amount then
      new_status := 'Mismatch';
    else
      new_status := 'Success';
    end if;
  elsif p_result_code = 1032 then
    new_status := 'Cancelled';
  else
    new_status := 'Failed';
  end if;

  if new_status = 'Success' then
    new_receipt := 'RCT-' || to_char(now() at time zone 'Africa/Nairobi', 'YYMMDD')
                   || '-' || lpad(nextval('public.receipt_number_seq')::text, 5, '0');
  end if;

  update public.payments
  set status         = new_status,
      result_code    = p_result_code,
      result_desc    = p_result_desc,
      mpesa_receipt  = p_receipt,
      receipt_number = new_receipt,
      raw_callback   = p_raw,
      updated_at     = now()
  where id = pay.id;

  if new_status = 'Success' then
    if pay.purpose = 'Balance' then
      update public.cake_orders o
      set payment_status = 'Paid',
          amount_paid    = o.total_price::integer
      where o.id = any (pay.order_ids)
        and o.user_id = pay.user_id
        and o.payment_status = 'Deposit Paid';
    else
      update public.cake_orders o
      set payment_status = case when o.payment_type = 'Deposit' then 'Deposit Paid' else 'Paid' end,
          amount_paid    = case when o.payment_type = 'Deposit'
                                then ceil(o.total_price / 2.0)::integer
                                else o.total_price::integer end
      where o.id = any (pay.order_ids)
        and o.user_id = pay.user_id
        and o.payment_status = 'Unpaid';
    end if;

    insert into public.notifications (user_id, title, body, kind, payment_id)
    values (
      pay.user_id,
      'Payment received',
      format('We received KES %s. Receipt %s.', to_char(pay.amount, 'FM999,999,999'), new_receipt),
      'payment',
      pay.id
    );
  end if;

  return new_status;
end;
$$;

revoke all on function public.settle_mpesa_payment(text, integer, text, text, numeric, jsonb)
  from public, anon, authenticated;
grant execute on function public.settle_mpesa_payment(text, integer, text, text, numeric, jsonb)
  to service_role;
