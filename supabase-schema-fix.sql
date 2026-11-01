alter table public.profiles
add column if not exists username text;

create unique index if not exists profiles_username_unique
on public.profiles (username)
where username is not null;

comment on column public.profiles.username is 'Public handle chosen during sign-up';
