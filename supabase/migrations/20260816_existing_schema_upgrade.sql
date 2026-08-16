-- Compatibility upgrade for a project where services, appointments,
-- blocked_dates, business_hours, and clinic_settings were created already.
-- Run this once in the Supabase SQL Editor.

do $$ begin
  create type public.user_role as enum ('patient', 'dentist', 'staff', 'admin');
exception when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default 'New patient',
  phone text,
  role public.user_role not null default 'patient',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.patients (
  id uuid primary key references auth.users(id) on delete cascade,
  date_of_birth date,
  address text,
  emergency_contact_name text,
  emergency_contact_phone text,
  medical_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Dentist IDs intentionally reference auth.users so they work with the
-- existing appointments.dentist_id column from the initial schema.
create table if not exists public.dentists (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  specialty text,
  bio text,
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text,
  subject text not null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.patients enable row level security;
alter table public.dentists enable row level security;
alter table public.notifications enable row level security;
alter table public.messages enable row level security;

-- Server API uses the server-only service role. These policies are only for
-- safe direct authenticated reads from the browser.
drop policy if exists "Public dentist directory" on public.dentists;
create policy "Public dentist directory" on public.dentists
  for select to anon, authenticated using (is_active = true);

drop policy if exists "Users view own profile" on public.profiles;
create policy "Users view own profile" on public.profiles
  for select to authenticated using (id = auth.uid());

drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid() and role = 'patient');

-- Make the supplied account an administrator after it exists in Auth.
insert into public.profiles (id, full_name, role)
select id, coalesce(raw_user_meta_data ->> 'full_name', email, 'Administrator'), 'admin'
from auth.users
where id = 'f20d8df8-a5b3-4b0a-ad41-b176a980e550'::uuid
on conflict (id) do update set role = 'admin';
