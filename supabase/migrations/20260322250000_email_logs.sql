-- FarmVault outbound email audit trail for developer visibility.
-- Rows are written by Edge Functions (service role). Developers read via RLS.

begin;

create table if not exists public.email_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references core.companies (id) on delete set null,
  company_name text,
  recipient_email text not null,
  email_type text not null,
  subject text not null,
  status text not null,
  provider text not null default 'resend',
  provider_message_id text,
  triggered_by text,
  error_message text,
  metadata jsonb,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  constraint email_logs_status_check check (status in ('pending', 'sent', 'failed'))
);

create index if not exists idx_email_logs_recipient_lower
  on public.email_logs (lower(recipient_email));

create index if not exists idx_email_logs_company_id
  on public.email_logs (company_id)
  where company_id is not null;

create index if not exists idx_email_logs_email_type
  on public.email_logs (email_type);

create index if not exists idx_email_logs_status
  on public.email_logs (status);

create index if not exists idx_email_logs_created_at
  on public.email_logs (created_at desc);

comment on table public.email_logs is 'Outbound transactional email attempts (Resend). Developer visibility; written by Edge Functions.';

alter table public.email_logs enable row level security;

drop policy if exists email_logs_select_developer on public.email_logs;
create policy email_logs_select_developer
  on public.email_logs
  for select
  to authenticated
  using (admin.is_developer(auth.uid()));

grant select on public.email_logs to authenticated;
grant all on public.email_logs to service_role;

commit;
