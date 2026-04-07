-- Operational notifications (per Clerk user) + optional pg_net dispatch to Edge Function for Web Push.
--
-- Hosted setup (optional — trigger no-ops if Vault secrets are missing):
--   1) Vault secrets (Dashboard → Project Settings → Vault), same pattern as engagement emails:
--        notification_push_project_url  → https://YOUR_REF.supabase.co  (no trailing slash)
--        notification_push_secret       → long random string (match Edge secret NOTIFICATION_PUSH_SECRET)
--   2) Edge Function env: NOTIFICATION_PUSH_SECRET (same value as vault secret)
--   3) Deploy: npx supabase functions deploy notification-push-dispatch --no-verify-jwt
--
-- Client apps subscribe via Supabase Realtime on public.notifications for in-app panel sync.

begin;

create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- notifications (canonical rows for bell + push)
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text not null,
  company_id uuid references core.companies (id) on delete cascade,
  title text not null,
  message text,
  type text not null check (type in ('company', 'ambassador', 'developer')),
  read boolean not null default false,
  click_url text,
  -- Optional: reuse as Web Push tag to group similar events
  group_key text,
  created_at timestamptz not null default now()
);

create index if not exists notifications_clerk_user_id_created_at_idx
  on public.notifications (clerk_user_id, created_at desc);

comment on table public.notifications is
  'User-scoped operational notifications; INSERT may trigger Web Push via notification-push-dispatch Edge Function.';

alter table public.notifications enable row level security;

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select
  using (clerk_user_id = (auth.jwt() ->> 'sub'));

drop policy if exists notifications_insert_self on public.notifications;
create policy notifications_insert_self on public.notifications
  for insert
  with check (clerk_user_id = (auth.jwt() ->> 'sub'));

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update
  using (clerk_user_id = (auth.jwt() ->> 'sub'))
  with check (clerk_user_id = (auth.jwt() ->> 'sub'));

grant select, insert, update on public.notifications to authenticated;
grant all on public.notifications to service_role;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
do $realtime$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      execute 'alter publication supabase_realtime add table public.notifications';
    exception
      when duplicate_object then null;
    end;
  end if;
end
$realtime$;

-- ---------------------------------------------------------------------------
-- push_subscriptions: tenant + role + device metadata
-- ---------------------------------------------------------------------------
alter table public.push_subscriptions
  add column if not exists company_id uuid references core.companies (id) on delete set null;

alter table public.push_subscriptions
  add column if not exists role text;

alter table public.push_subscriptions
  add column if not exists device_info jsonb;

create index if not exists push_subscriptions_company_id_idx
  on public.push_subscriptions (company_id)
  where company_id is not null;

-- ---------------------------------------------------------------------------
-- After INSERT on notifications → notify Edge Function (Web Push)
-- ---------------------------------------------------------------------------
create or replace function public.notify_push_on_notification_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_url text;
  secret text;
begin
  select decrypted_secret into base_url
  from vault.decrypted_secrets
  where name = 'notification_push_project_url'
  limit 1;

  select decrypted_secret into secret
  from vault.decrypted_secrets
  where name = 'notification_push_secret'
  limit 1;

  if base_url is null or secret is null or length(trim(base_url)) = 0 or length(trim(secret)) = 0 then
    raise notice 'notification push skipped: set vault secrets notification_push_project_url and notification_push_secret';
    return new;
  end if;

  perform net.http_post(
    url := rtrim(base_url, '/') || '/functions/v1/notification-push-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || trim(secret)
    ),
    body := jsonb_build_object('notification_id', new.id::text)
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_push_on_notification_insert on public.notifications;
create trigger trg_notify_push_on_notification_insert
  after insert on public.notifications
  for each row
  execute procedure public.notify_push_on_notification_insert();

commit;
