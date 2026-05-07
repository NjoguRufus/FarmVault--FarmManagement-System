-- Developer notification testing: stores one row per test send attempt.
-- Written by the developer testing page; isolated from the production send pipeline.

begin;

create table if not exists public.notification_test_logs (
  id                uuid        primary key default gen_random_uuid(),
  notification_type text        not null check (notification_type in ('morning', 'evening', 'inactivity', 'weekly')),
  inactivity_tier   text        check (inactivity_tier in ('2d', '5d', '7d', '14d')),
  recipient_email   text        not null,
  company_id        uuid        references core.companies (id) on delete set null,
  company_name      text,
  email_subject     text,
  send_status       text        not null default 'pending' check (send_status in ('pending', 'sent', 'failed')),
  error_message     text,
  sent_by           text        not null,
  created_at        timestamptz not null default now()
);

create index if not exists notification_test_logs_sent_by_created_idx
  on public.notification_test_logs (sent_by, created_at desc);

alter table public.notification_test_logs enable row level security;

drop policy if exists notification_test_logs_own on public.notification_test_logs;
create policy notification_test_logs_own on public.notification_test_logs
  for all
  using  (sent_by = (auth.jwt() ->> 'sub'))
  with check (sent_by = (auth.jwt() ->> 'sub'));

grant select, insert, update, delete on public.notification_test_logs to authenticated;
grant all                             on public.notification_test_logs to service_role;

comment on table public.notification_test_logs is
  'Developer test send history for companion notification testing. '
  'Written by the developer testing page; not part of the production send pipeline.';

commit;
