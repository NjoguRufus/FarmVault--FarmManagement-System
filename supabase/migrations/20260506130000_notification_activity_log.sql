-- Companion notification engagement tracking: records open and click events per email.
-- Written by the Resend webhook handler (service role) or a tracking-pixel edge function.
-- Used to compute open rates, click rates, and to suppress repeat sends for non-engaged users.

begin;

-- ---------------------------------------------------------------------------
-- notification_activity_log
-- ---------------------------------------------------------------------------

create table if not exists public.notification_activity_log (
  id              uuid        primary key default gen_random_uuid(),
  -- Recipient identity (clerk_user_id may be null if the link was opened without auth context)
  clerk_user_id   text,
  company_id      uuid        references core.companies (id) on delete set null,
  -- Correlation back to the outbound email row in email_logs
  email_log_id    uuid,
  -- Notification type that generated this email
  notification_type text      check (notification_type in ('morning', 'evening', 'inactivity', 'weekly')),
  inactivity_tier text        check (inactivity_tier in ('2d', '5d', '7d', '14d')),
  -- Engagement event
  event_type      text        not null check (event_type in ('open', 'click')),
  -- For click events, the destination URL. Null for opens.
  link_url        text,
  -- Resend message ID (from webhook) — allows deduplicating duplicate webhook deliveries
  resend_message_id text,
  -- Raw webhook payload or tracking context for debugging
  metadata        jsonb,
  recorded_at     timestamptz not null default now()
);

-- Primary lookup: all events for a user, newest first
create index if not exists notification_activity_log_user_recorded_idx
  on public.notification_activity_log (clerk_user_id, recorded_at desc)
  where clerk_user_id is not null;

-- Reporting: events by company and type within a time range
create index if not exists notification_activity_log_company_type_recorded_idx
  on public.notification_activity_log (company_id, notification_type, recorded_at desc)
  where company_id is not null;

-- Deduplication guard: one open per resend message (webhook can fire multiple times)
create unique index if not exists notification_activity_log_resend_dedup_uidx
  on public.notification_activity_log (resend_message_id, event_type)
  where resend_message_id is not null;

-- Correlation: events linked to a specific outbound email_log row
create index if not exists notification_activity_log_email_log_idx
  on public.notification_activity_log (email_log_id)
  where email_log_id is not null;

alter table public.notification_activity_log enable row level security;

-- Authenticated users can read their own engagement events (for a "your email was opened" audit).
drop policy if exists notification_activity_log_own_read on public.notification_activity_log;
create policy notification_activity_log_own_read on public.notification_activity_log
  for select
  using (clerk_user_id = (auth.jwt() ->> 'sub'));

-- Only service role (webhook handler / Edge Function) may write.
drop policy if exists notification_activity_log_service_write on public.notification_activity_log;
create policy notification_activity_log_service_write on public.notification_activity_log
  for insert
  with check (false);  -- authenticated users cannot insert directly; service role bypasses RLS

grant select on public.notification_activity_log to authenticated;
grant all    on public.notification_activity_log to service_role;

comment on table public.notification_activity_log is
  'Records open and click engagement events for companion notification emails. '
  'Written by the Resend webhook handler (service role). '
  'Used for open-rate reporting, engagement analytics, and suppression logic.';

comment on column public.notification_activity_log.resend_message_id is
  'Resend message ID from the webhook payload. Used to deduplicate duplicate webhook deliveries '
  'for the same event_type (open or click).';

comment on column public.notification_activity_log.event_type is
  'open  — email was opened (from tracking pixel or Resend open event). '
  'click — a tracked link inside the email was clicked.';

commit;
