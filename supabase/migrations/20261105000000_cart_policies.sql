-- =====================================================================
-- Vatican Cake Point: let customers remove and edit items in their CART
-- Run in the Supabase SQL Editor.
--
-- Why: with row-level security on, a delete or update that no policy
-- allows does NOT raise an error. It silently affects zero rows. That is
-- why removed cakes came back after a refresh.
--
-- These policies let a customer change only their OWN orders, and only
-- while the order is still Unpaid (i.e. still in the cart). Once paid,
-- an order can only be changed by staff through the admin functions.
-- =====================================================================

-- Remove a cake from the cart
drop policy if exists "Customers delete own unpaid orders" on public.cake_orders;
create policy "Customers delete own unpaid orders"
  on public.cake_orders for delete to authenticated
  using (user_id = auth.uid() and payment_status = 'Unpaid');

-- Switch between Full and 50% deposit (and other cart edits)
drop policy if exists "Customers update own unpaid orders" on public.cake_orders;
create policy "Customers update own unpaid orders"
  on public.cake_orders for update to authenticated
  using (user_id = auth.uid() and payment_status = 'Unpaid')
  with check (user_id = auth.uid());

-- Safety net: the cake_orders_enforce_rules trigger (migration 1) already stops
-- customers changing price, payment status or amount paid, even with this policy.

-- Check the result: you should see both policies listed
select policyname, cmd from pg_policies
where schemaname = 'public' and tablename = 'cake_orders'
order by policyname;
