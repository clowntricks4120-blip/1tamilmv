-- 1TamilMV legal movie discovery catalogue
create extension if not exists pgcrypto;

create table if not exists public.movies (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  year integer,
  poster_url text,
  languages text[] not null default '{}',
  genres text[] not null default '{}',
  synopsis text not null default '',
  trailer_url text,
  official_links jsonb not null default '[]'::jsonb,
  featured boolean not null default false,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;

alter table public.movies enable row level security;
alter table public.admin_users enable row level security;

drop policy if exists "Anyone can read published movies" on public.movies;
create policy "Anyone can read published movies" on public.movies
for select using (published = true or public.is_admin());

drop policy if exists "Admins can insert movies" on public.movies;
create policy "Admins can insert movies" on public.movies
for insert with check (public.is_admin());

drop policy if exists "Admins can update movies" on public.movies;
create policy "Admins can update movies" on public.movies
for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins can delete movies" on public.movies;
create policy "Admins can delete movies" on public.movies
for delete using (public.is_admin());

drop policy if exists "Admins can read admin list" on public.admin_users;
create policy "Admins can read admin list" on public.admin_users
for select using (user_id = auth.uid());

-- After creating your admin user in Supabase Authentication, run:
-- insert into public.admin_users(user_id)
-- select id from auth.users where email = 'YOUR_ADMIN_EMAIL';
