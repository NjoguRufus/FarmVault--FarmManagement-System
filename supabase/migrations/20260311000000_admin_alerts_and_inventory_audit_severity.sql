-- Admin alerts: immediate alerts for high-risk actions (inventory edit/delete/deduct, etc.)
-- Selected admins can receive in-app and (future) push notifications.

begin;

-- admin_alerts: one row per alert; recipients are determined by alert_recipients table.
create table if not exists public.admin_alerts (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  severity text not null default 'normal' check (severity in ('normal', 'high', 'critical')),
  module text not null,
  action text not null,
  actor_user_id text,
  actor_name text,
  target_id text,
  target_label text,
  metadata jsonb,
  detail_path text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_alerts_company_created
  on public.admin_alerts (company_id, created_at desc);
create index if not exists idx_admin_alerts_company_read
  on public.admin_alerts (company_id, read) where read = false;

-- RLS: company-scoped. App filters by company_id when listing; allow select for any authenticated context.
alter table public.admin_alerts enable row level security;

drop policy if exists admin_alerts_select on public.admin_alerts;
drop policy if exists admin_alerts_insert on public.admin_alerts;
create policy admin_alerts_select on public.admin_alerts for select
  using (true);

create policy admin_alerts_insert on public.admin_alerts for insert
  with check (true);

-- alert_recipients: which users (by clerk_user_id) receive notifications for a company.
-- Used for in-app alert center and future push; admin can choose recipients.
create table if not exists public.alert_recipients (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  clerk_user_id text not null,
  receive_in_app boolean not null default true,
  receive_push boolean not null default false,
  created_at timestamptz not null default now(),
  unique(company_id, clerk_user_id)
);

create index if not exists idx_alert_recipients_company
  on public.alert_recipients (company_id);

alter table public.alert_recipients enable row level security;

drop policy if exists alert_recipients_select on public.alert_recipients;
drop policy if exists alert_recipients_insert on public.alert_recipients;
drop policy if exists alert_recipients_update on public.alert_recipients;
drop policy if exists alert_recipients_delete on public.alert_recipients;
create policy alert_recipients_select on public.alert_recipients for select using (true);
create policy alert_recipients_insert on public.alert_recipients for insert with check (true);
create policy alert_recipients_update on public.alert_recipients for update using (true);
create policy alert_recipients_delete on public.alert_recipients for delete using (true);

-- Optional: add severity to inventory.audit_logs if the table has a severity column.
-- Uncomment and run if your inventory schema has audit_logs with optional severity:
-- alter table inventory.audit_logs add column if not exists severity text default 'normal';

commit;
