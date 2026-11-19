-- =====================================================================
-- Vatican Cake Point: catalog columns + photo storage
-- Run in the Supabase SQL Editor (after the earlier migrations).
--
-- You manage the menu from the Supabase dashboard:
--   Storage > cake-images       -> upload the photos
--   Table Editor > cake_catalog -> add or edit cakes
-- See CATALOG_GUIDE.md for the step by step.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Catalog columns (the Home screen and detail sheet read all of these)
-- ---------------------------------------------------------------------
alter table public.cake_catalog add column if not exists category       text;
alter table public.cake_catalog add column if not exists is_active      boolean not null default true;
alter table public.cake_catalog add column if not exists sort_order     integer not null default 100;
alter table public.cake_catalog add column if not exists ingredients    text;      -- comma separated: Butter, Eggs, Vanilla
alter table public.cake_catalog add column if not exists lead_time_hours integer;  -- empty = 48
alter table public.cake_catalog add column if not exists tiers          integer;   -- empty = 1
alter table public.cake_catalog add column if not exists layers         integer;   -- empty = 3
alter table public.cake_catalog add column if not exists finish         text;      -- e.g. Buttercream, Chocolate drip
alter table public.cake_catalog add column if not exists image_key      text;      -- optional: matches a local fallback image in the app

-- Category must be one of the filter chips on Home (or empty)
alter table public.cake_catalog drop constraint if exists cake_catalog_category_check;
alter table public.cake_catalog
  add constraint cake_catalog_category_check
  check (category is null or category in ('Wedding', 'Birthday', 'Cupcakes', 'Custom'));

-- Best-effort category for cakes you already have. REVIEW these in the Table Editor.
update public.cake_catalog
set category = case
  when coalesce(title, '') || ' ' || coalesce(description, '') ilike '%wedding%'  then 'Wedding'
  when coalesce(title, '') || ' ' || coalesce(description, '') ilike '%cupcake%'  then 'Cupcakes'
  when coalesce(title, '') || ' ' || coalesce(description, '') ilike '%birthday%' then 'Birthday'
  when coalesce(title, '') || ' ' || coalesce(description, '') ilike '%custom%'   then 'Custom'
  else null
end
where category is null;

create index if not exists cake_catalog_active_sort_idx on public.cake_catalog (is_active, sort_order);

-- ---------------------------------------------------------------------
-- 2. Who can read and change the catalog
--    Everyone signed in can read ACTIVE cakes; staff can read and change all.
--    (Editing from the Supabase dashboard always works; it bypasses these rules.)
-- ---------------------------------------------------------------------
alter table public.cake_catalog enable row level security;

drop policy if exists "Read active cakes" on public.cake_catalog;
create policy "Read active cakes"
  on public.cake_catalog for select to authenticated
  using (is_active or public.is_admin());

drop policy if exists "Staff manage catalog" on public.cake_catalog;
create policy "Staff manage catalog"
  on public.cake_catalog for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------
-- 3. Photo storage: a PUBLIC bucket (anyone can view photos, only staff can change them)
--    Limits: 1 MB per file, JPEG / PNG / WebP only.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cake-images', 'cake-images', true, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Anyone can view cake photos" on storage.objects;
create policy "Anyone can view cake photos"
  on storage.objects for select
  using (bucket_id = 'cake-images');

drop policy if exists "Staff upload cake photos" on storage.objects;
create policy "Staff upload cake photos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'cake-images' and public.is_admin());

drop policy if exists "Staff update cake photos" on storage.objects;
create policy "Staff update cake photos"
  on storage.objects for update to authenticated
  using (bucket_id = 'cake-images' and public.is_admin());

drop policy if exists "Staff delete cake photos" on storage.objects;
create policy "Staff delete cake photos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'cake-images' and public.is_admin());

-- ---------------------------------------------------------------------
-- 4. Check: list your cakes and what the app will show for each
-- ---------------------------------------------------------------------
select title, category, is_active, sort_order, image_url
from public.cake_catalog
order by sort_order, title;
