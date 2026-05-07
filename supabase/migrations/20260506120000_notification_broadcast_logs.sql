-- Manual broadcast notification history: one row per developer broadcast send.

begin;

create table if not exists public.notification_broadcast_logs (
  id                uuid        primary key default gen_random_uuid(),
  mode              text        not null check (mode in ('all', 'selected')),
  notification_type text        not null check (notification_type in ('morning', 'evening', 'inactivity', 'weekly')),
  inactivity_tier   text        check (inactivity_tier in ('2d', '5d', '7d', '14d')),
  recipient_count   integer     not null default 0,
  success_count     integer     not null default 0,
  failed_count      integer     not null default 0,
  recipient_ids     jsonb,
  email_subject     text,
  triggered_by      text        not null,
  delivery_status   text        not null default 'pending'
                    check (delivery_status in ('pending', 'sending', 'completed', 'failed')),
  created_at        timestamptz not null default now()
);

create index if not exists notification_broadcast_logs_triggered_by_idx
  on public.notification_broadcast_logs (triggered_by, created_at desc);

alter table public.notification_broadcast_logs enable row level security;

drop policy if exists notification_broadcast_logs_own on public.notification_broadcast_logs;
create policy notification_broadcast_logs_own on public.notification_broadcast_logs
  for all
  using  (triggered_by = (auth.jwt() ->> 'sub'))
  with check (triggered_by = (auth.jwt() ->> 'sub'));

grant select, insert, update, delete on public.notification_broadcast_logs to authenticated;
grant all                             on public.notification_broadcast_logs to service_role;

comment on table public.notification_broadcast_logs is
  'Records every manual developer broadcast send (mode, type, recipient count, success/fail). '
  'Written by the developer broadcast panel; separate from the production cron pipeline.';

commit;
