-- Web Push subscriptions (VAPID); one row per browser/device endpoint per user (Clerk sub).

begin;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text not null,
  endpoint text not null,
  subscription_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_subscriptions_endpoint_unique unique (endpoint)
);

create index if not exists push_subscriptions_clerk_user_id_idx
  on public.push_subscriptions (clerk_user_id);

comment on table public.push_subscriptions is
  'Browser Web Push subscription JSON per Clerk user; used by Edge Functions with VAPID to send notifications.';

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_select_own on public.push_subscriptions;
create policy push_subscriptions_select_own on public.push_subscriptions
  for select
  using (clerk_user_id = (auth.jwt() ->> 'sub'));

drop policy if exists push_subscriptions_insert_own on public.push_subscriptions;
create policy push_subscriptions_insert_own on public.push_subscriptions
  for insert
  with check (clerk_user_id = (auth.jwt() ->> 'sub'));

drop policy if exists push_subscriptions_update_own on public.push_subscriptions;
create policy push_subscriptions_update_own on public.push_subscriptions
  for update
  using (clerk_user_id = (auth.jwt() ->> 'sub'))
  with check (clerk_user_id = (auth.jwt() ->> 'sub'));

drop policy if exists push_subscriptions_delete_own on public.push_subscriptions;
create policy push_subscriptions_delete_own on public.push_subscriptions
  for delete
  using (clerk_user_id = (auth.jwt() ->> 'sub'));

grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions to service_role;

commit;
