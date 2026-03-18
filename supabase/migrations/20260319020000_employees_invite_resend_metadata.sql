-- Add resend tracking metadata for employee invites.
-- Safely adds columns to support "Resend invite" functionality.

begin;

alter table public.employees
  add column if not exists invite_resend_count integer not null default 0;

alter table public.employees
  add column if not exists invite_last_sent_at timestamptz;

alter table public.employees
  add column if not exists invite_last_resent_at timestamptz;

alter table public.employees
  add column if not exists invite_last_resent_by uuid;

create index if not exists idx_employees_invite_last_sent_at
  on public.employees(invite_last_sent_at desc)
  where invite_last_sent_at is not null;

commit;

