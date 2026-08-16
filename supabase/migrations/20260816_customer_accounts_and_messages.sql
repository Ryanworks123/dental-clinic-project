-- Extend the existing messages table into a real patient/admin conversation store.
-- Existing public contact inquiries remain valid root messages.
alter table public.messages
  add column if not exists patient_id uuid references public.patients(id) on delete set null,
  add column if not exists sender_id uuid references public.profiles(id) on delete set null,
  add column if not exists recipient_id uuid references public.profiles(id) on delete set null,
  add column if not exists parent_id uuid references public.messages(id) on delete cascade;

create index if not exists messages_patient_created_idx on public.messages(patient_id, created_at desc);
create index if not exists messages_parent_created_idx on public.messages(parent_id, created_at asc);
create index if not exists messages_recipient_read_idx on public.messages(recipient_id, is_read, created_at desc);

-- Patients can only read and create their own conversation records. Admin tools
-- are still enforced by server-side role checks; these policies are defense in depth.
drop policy if exists "patient own messages" on public.messages;
create policy "patient own messages" on public.messages
  for select using (patient_id = auth.uid());

drop policy if exists "patient creates own messages" on public.messages;
create policy "patient creates own messages" on public.messages
  for insert with check (patient_id = auth.uid() and sender_id = auth.uid());

-- Make patient deletion safe: profile/patient rows cascade with the auth user,
-- appointment patient_id and message participant references become NULL while
-- preserving the booking and conversation history for clinic audit purposes.
