create extension if not exists pgcrypto;
create extension if not exists btree_gist;

create type public.user_role as enum ('patient', 'dentist', 'staff', 'admin');
create type public.appointment_status as enum ('pending', 'confirmed', 'completed', 'cancelled', 'rescheduled', 'no_show');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text,
  role public.user_role not null default 'patient',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.patients (
  id uuid primary key references public.profiles(id) on delete cascade,
  date_of_birth date,
  address text,
  emergency_contact_name text,
  emergency_contact_phone text,
  medical_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.dentists (
  id uuid primary key references public.profiles(id) on delete cascade,
  display_name text not null,
  specialty text,
  bio text,
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  price numeric(10, 2) not null check (price >= 0),
  duration_minutes integer not null check (duration_minutes > 0),
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.dentist_schedules (
  id uuid primary key default gen_random_uuid(),
  dentist_id uuid not null references public.dentists(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  starts_at time not null,
  ends_at time not null,
  is_available boolean not null default true,
  check (ends_at > starts_at),
  unique (dentist_id, day_of_week)
);

create table public.blocked_dates (
  id uuid primary key default gen_random_uuid(),
  dentist_id uuid references public.dentists(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table public.clinic_settings (
  id boolean primary key default true check (id),
  clinic_name text not null default 'Bright Smile Dental Clinic',
  address text,
  phone text,
  email text,
  timezone text not null default 'Asia/Manila',
  appointment_interval_minutes integer not null default 30 check (appointment_interval_minutes > 0),
  allow_online_booking boolean not null default true,
  cancellation_notice_hours integer not null default 24 check (cancellation_notice_hours >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references public.patients(id) on delete set null,
  dentist_id uuid not null references public.dentists(id) on delete restrict,
  service_id uuid not null references public.services(id) on delete restrict,
  patient_name text not null,
  patient_phone text not null,
  patient_email text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.appointment_status not null default 'pending',
  notes text,
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  exclude using gist (
    dentist_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('pending', 'confirmed', 'rescheduled'))
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text,
  subject text not null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index appointments_patient_idx on public.appointments(patient_id, starts_at desc);
create index appointments_dentist_idx on public.appointments(dentist_id, starts_at);
create index appointments_status_idx on public.appointments(status, starts_at);
create index notifications_recipient_idx on public.notifications(recipient_id, is_read);

create or replace function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();
create trigger patients_updated before update on public.patients for each row execute function public.set_updated_at();
create trigger dentists_updated before update on public.dentists for each row execute function public.set_updated_at();
create trigger services_updated before update on public.services for each row execute function public.set_updated_at();
create trigger clinic_settings_updated before update on public.clinic_settings for each row execute function public.set_updated_at();
create trigger appointments_updated before update on public.appointments for each row execute function public.set_updated_at();

-- Creates a profile and patient record for every normal sign-up.
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)), new.raw_user_meta_data ->> 'phone');
  insert into public.patients (id) values (new.id);
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.patients enable row level security;
alter table public.dentists enable row level security;
alter table public.services enable row level security;
alter table public.dentist_schedules enable row level security;
alter table public.blocked_dates enable row level security;
alter table public.clinic_settings enable row level security;
alter table public.appointments enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;

create or replace function public.current_role() returns public.user_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create policy "public clinic information" on public.services for select using (is_active = true);
create policy "public dentist directory" on public.dentists for select using (is_active = true);
create policy "public schedule visibility" on public.dentist_schedules for select using (is_available = true);
create policy "patient own profile" on public.profiles for all using (id = auth.uid()) with check (id = auth.uid() and role = 'patient');
create policy "patient own record" on public.patients for all using (id = auth.uid()) with check (id = auth.uid());
create policy "patient own appointments" on public.appointments for select using (patient_id = auth.uid());
create policy "patient creates appointments" on public.appointments for insert with check (patient_id = auth.uid());
create policy "patient own notifications" on public.notifications for select using (recipient_id = auth.uid());

-- A dedicated policy grants trusted staff complete operational access.
create policy "staff full clinic access" on public.profiles for all using (public.current_role() in ('admin', 'staff')) with check (public.current_role() in ('admin', 'staff'));
create policy "staff full patient access" on public.patients for all using (public.current_role() in ('admin', 'staff')) with check (public.current_role() in ('admin', 'staff'));
create policy "staff full dentist access" on public.dentists for all using (public.current_role() in ('admin', 'staff')) with check (public.current_role() in ('admin', 'staff'));
create policy "staff full service access" on public.services for all using (public.current_role() in ('admin', 'staff')) with check (public.current_role() in ('admin', 'staff'));
create policy "staff full schedule access" on public.dentist_schedules for all using (public.current_role() in ('admin', 'staff')) with check (public.current_role() in ('admin', 'staff'));
create policy "staff full block access" on public.blocked_dates for all using (public.current_role() in ('admin', 'staff')) with check (public.current_role() in ('admin', 'staff'));
create policy "staff full settings access" on public.clinic_settings for all using (public.current_role() in ('admin', 'staff')) with check (public.current_role() in ('admin', 'staff'));
create policy "staff full appointment access" on public.appointments for all using (public.current_role() in ('admin', 'staff')) with check (public.current_role() in ('admin', 'staff'));
create policy "staff full message access" on public.messages for all using (public.current_role() in ('admin', 'staff')) with check (public.current_role() in ('admin', 'staff'));
create policy "staff full notification access" on public.notifications for all using (public.current_role() in ('admin', 'staff')) with check (public.current_role() in ('admin', 'staff'));

insert into public.clinic_settings(id) values(true) on conflict do nothing;
-- Promote the supplied account after it exists in auth.users.
update public.profiles set role = 'admin' where id = 'f20d8df8-a5b3-4b0a-ad41-b176a980e550';
