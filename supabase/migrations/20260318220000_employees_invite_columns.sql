-- Add invite tracking columns to public.employees for invite-employee Edge Function.
-- These columns are written when sending invites; listEmployees can optionally select them.

begin;

-- invite_status: 'sent' | 'pending' | null (for non-invited employees)
alter table public.employees
  add column if not exists invite_status text;

-- invite_sent_at: when the Clerk invitation email was sent
alter table public.employees
  add column if not exists invite_sent_at timestamptz;

create index if not exists idx_employees_invite_sent_at
  on public.employees(invite_sent_at desc)
  where invite_sent_at is not null;

commit;
