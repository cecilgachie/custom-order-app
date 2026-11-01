-- =====================================================================
-- Vatican Cake Point: M-Pesa payments
--
-- ASSUMPTIONS (change if your schema differs):
--   * public.cake_orders.id is uuid (if it is bigint, change payments.order_ids to bigint[])
--   * public.profiles.system_role holds 'System_Admin' / 'Staff_Admin' for staff
--   * cake_orders.payment_status has no CHECK constraint or enum that rejects
--     the new values 'Paid' and 'Deposit Paid'. If it does, extend it first.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Helper: is the current user staff?
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.system_role in ('System_Admin', 'Staff_Admin')
  );
$$;

-- ---------------------------------------------------------------------
-- 1. Payments ledger (one row per STK push attempt)
-- ---------------------------------------------------------------------
create table if not exists public.payments (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users (id) on delete restrict,
  order_ids            uuid[] not null,
  phone                text not null,
  amount               integer not null check (amount > 0),
  status               text not null default 'Pending'
                         check (status in ('Pending', 'Success', 'Failed', 'Cancelled', 'Mismatch')),
  merchant_request_id  text,
  checkout_request_id  text unique,
  mpesa_receipt        text unique,
  result_code          integer,
  result_desc          text,
  raw_callback         jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists payments_user_created_idx on public.payments (user_id, created_at desc);
create index if not exists payments_order_ids_idx on public.payments using gin (order_ids);

alter table public.payments enable row level security;

-- Customers can read their own payments. Nobody can write from the app:
-- only the Edge Functions (service role) insert and settle payments.
drop policy if exists "Users read own payments" on public.payments;
create policy "Users read own payments"
  on public.payments for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "Admins read all payments" on public.payments;
create policy "Admins read all payments"
  on public.payments for select to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------
-- 2. cake_orders: amount_paid + tamper protection
-- ---------------------------------------------------------------------
alter table public.cake_orders
  add column if not exists amount_paid integer not null default 0;

create or replace function public.cake_orders_enforce_rules()
returns trigger
language plpgsql
as $$
declare
  jwt_role   text := coalesce(auth.role(), '');
  is_client  boolean;
  multiplier numeric;
begin
  -- "client" = a request from the app (anon/authenticated) by a non-staff user.
  -- Edge Functions (service_role) and the SQL editor are not clients.
  is_client := jwt_role in ('anon', 'authenticated') and not public.is_admin();

  -- Price is computed here, never trusted from the app.
  -- Keep these numbers in sync with the customizer (2200 per kg, size multipliers).
  multiplier := case new.cake_size when 'Small' then 0.8 when 'Large' then 1.4 else 1.0 end;

  if tg_op = 'INSERT'
     or new.total_weight_kg is distinct from old.total_weight_kg
     or new.cake_size       is distinct from old.cake_size then
    new.total_price := round(coalesce(new.total_weight_kg, 1.0) * 2200 * multiplier);
  elsif is_client then
    new.total_price := old.total_price;
  end if;

  if is_client then
    if tg_op = 'INSERT' then
      new.payment_status := 'Unpaid';
      new.amount_paid    := 0;
    else
      -- Customers can never mark an order paid or edit what was paid
      new.payment_status := old.payment_status;
      new.amount_paid    := old.amount_paid;
      new.order_status   := old.order_status;
      -- ...and can only switch Full/Deposit while the order is still unpaid
      if old.payment_status <> 'Unpaid' then
        new.payment_type := old.payment_type;
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists cake_orders_enforce_rules on public.cake_orders;
create trigger cake_orders_enforce_rules
  before insert or update on public.cake_orders
  for each row execute function public.cake_orders_enforce_rules();

-- ---------------------------------------------------------------------
-- 3. Settlement: called ONLY by the mpesa-callback Edge Function
--    Atomic and idempotent (Safaricom may deliver a callback twice).
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
  pay        public.payments%rowtype;
  new_status text;
begin
  select * into pay
  from public.payments
  where checkout_request_id = p_checkout_request_id
  for update;

  if not found then
    return 'unknown';
  end if;

  if pay.status <> 'Pending' then
    return 'duplicate';
  end if;

  if p_result_code = 0 then
    -- Money moved. Make sure it is the amount we asked for.
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

  update public.payments
  set status        = new_status,
      result_code   = p_result_code,
      result_desc   = p_result_desc,
      mpesa_receipt = p_receipt,
      raw_callback  = p_raw,
      updated_at    = now()
  where id = pay.id;

  if new_status = 'Success' then
    update public.cake_orders o
    set payment_status = case when o.payment_type = 'Deposit' then 'Deposit Paid' else 'Paid' end,
        amount_paid    = case when o.payment_type = 'Deposit'
                              then ceil(o.total_price / 2.0)::integer
                              else o.total_price::integer end
    where o.id = any (pay.order_ids)
      and o.user_id = pay.user_id
      and o.payment_status = 'Unpaid';
  end if;

  return new_status;
end;
$$;

revoke all on function public.settle_mpesa_payment(text, integer, text, text, numeric, jsonb)
  from public, anon, authenticated;
grant execute on function public.settle_mpesa_payment(text, integer, text, text, numeric, jsonb)
  to service_role;

-- ---------------------------------------------------------------------
-- 4. REVIEW (not changed automatically, because I have not seen your policies)
--    * Customers should only delete their own UNPAID orders:
--        using (user_id = auth.uid() and payment_status = 'Unpaid')
--    * view_admin_ledger_summary should be created WITH (security_invoker = true)
--      or otherwise restricted to staff, because views bypass RLS by default.
-- ---------------------------------------------------------------------
