-- Super Admin upgrade. Run after the existing clinic migration in Supabase SQL Editor.
-- The statements are idempotent and preserve historical appointments.

alter table public.profiles
  add column if not exists is_active boolean not null default true,
  add column if not exists deactivated_at timestamptz;

alter table public.dentists
  add column if not exists license_number text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists appointment_duration_minutes integer not null default 30 check (appointment_duration_minutes > 0),
  add column if not exists deactivated_at timestamptz;

alter table public.services
  add column if not exists icon text;

alter table public.appointments
  add column if not exists admin_notes text;

create table if not exists public.dentist_schedules (
  id uuid primary key default gen_random_uuid(),
  dentist_id uuid not null references public.dentists(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  starts_at time not null,
  ends_at time not null,
  is_available boolean not null default true,
  check (ends_at > starts_at),
  unique (dentist_id, day_of_week)
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists profiles_role_active_idx on public.profiles(role, is_active);
create index if not exists profiles_full_name_idx on public.profiles(full_name);
create index if not exists appointments_customer_search_idx on public.appointments(patient_name, patient_email, patient_phone);
create index if not exists audit_logs_created_at_idx on public.audit_logs(created_at desc);
create index if not exists audit_logs_entity_idx on public.audit_logs(entity_type, entity_id);

alter table public.audit_logs enable row level security;
alter table public.dentist_schedules enable row level security;

create or replace function public.current_role() returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

-- Admin is the only direct-database role with complete operational access.
drop policy if exists "staff full clinic access" on public.profiles;
drop policy if exists "staff full patient access" on public.patients;
drop policy if exists "staff full dentist access" on public.dentists;
drop policy if exists "staff full service access" on public.services;
drop policy if exists "staff full schedule access" on public.dentist_schedules;
drop policy if exists "staff full block access" on public.blocked_dates;
drop policy if exists "staff full settings access" on public.clinic_settings;
drop policy if exists "staff full appointment access" on public.appointments;
drop policy if exists "staff full message access" on public.messages;
drop policy if exists "staff full notification access" on public.notifications;

drop policy if exists "admin full profile access" on public.profiles;
drop policy if exists "admin full patient access" on public.patients;
drop policy if exists "admin full dentist access" on public.dentists;
drop policy if exists "admin full service access" on public.services;
drop policy if exists "admin full schedule access" on public.dentist_schedules;
drop policy if exists "admin full block access" on public.blocked_dates;
drop policy if exists "admin full settings access" on public.clinic_settings;
drop policy if exists "admin full appointment access" on public.appointments;
drop policy if exists "admin full message access" on public.messages;
drop policy if exists "admin full notification access" on public.notifications;
drop policy if exists "admin full audit access" on public.audit_logs;

create policy "admin full profile access" on public.profiles for all to authenticated using (public.current_role() = 'admin') with check (public.current_role() = 'admin');
create policy "admin full patient access" on public.patients for all to authenticated using (public.current_role() = 'admin') with check (public.current_role() = 'admin');
create policy "admin full dentist access" on public.dentists for all to authenticated using (public.current_role() = 'admin') with check (public.current_role() = 'admin');
create policy "admin full service access" on public.services for all to authenticated using (public.current_role() = 'admin') with check (public.current_role() = 'admin');
create policy "admin full schedule access" on public.dentist_schedules for all to authenticated using (public.current_role() = 'admin') with check (public.current_role() = 'admin');
create policy "admin full block access" on public.blocked_dates for all to authenticated using (public.current_role() = 'admin') with check (public.current_role() = 'admin');
create policy "admin full settings access" on public.clinic_settings for all to authenticated using (public.current_role() = 'admin') with check (public.current_role() = 'admin');
create policy "admin full appointment access" on public.appointments for all to authenticated using (public.current_role() = 'admin') with check (public.current_role() = 'admin');
create policy "admin full message access" on public.messages for all to authenticated using (public.current_role() = 'admin') with check (public.current_role() = 'admin');
create policy "admin full notification access" on public.notifications for all to authenticated using (public.current_role() = 'admin') with check (public.current_role() = 'admin');
create policy "admin full audit access" on public.audit_logs for all to authenticated using (public.current_role() = 'admin') with check (public.current_role() = 'admin');
