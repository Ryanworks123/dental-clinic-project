-- Delivery history for transactional clinic emails. The Express server writes
-- these rows using the service role; no email-provider secrets are stored.
create table if not exists public.email_events (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid references public.appointments(id) on delete set null,
  message_id uuid references public.messages(id) on delete set null,
  recipient text,
  subject text not null,
  provider text not null default 'resend',
  status text not null check (status in ('sent', 'failed')),
  error_message_safe text,
  resend_message_id text,
  created_at timestamptz not null default now()
);

create index if not exists email_events_created_at_idx on public.email_events (created_at desc);
create index if not exists email_events_appointment_id_idx on public.email_events (appointment_id);
create index if not exists email_events_message_id_idx on public.email_events (message_id);

alter table public.email_events enable row level security;
