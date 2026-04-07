-- Smart Daily Messaging: in-app inbox, rotation state, and Nairobi-friendly cron times.
-- Morning 6:30 EAT = 03:30 UTC; evening 7:00 PM EAT = 16:00 UTC.
-- Evening job runs Mon–Sat only; Sunday 7:00 PM EAT is weekly summary only (no duplicate evening).

begin;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.farmer_smart_messaging_state (
  company_id uuid not null references core.companies (id) on delete cascade,
  clerk_user_id text not null,
  last_morning_general_line text,
  last_evening_general_line text,
  updated_at timestamptz not null default now(),
  primary key (company_id, clerk_user_id)
);

create index if not exists farmer_smart_messaging_state_user_idx
  on public.farmer_smart_messaging_state (clerk_user_id);

create table if not exists public.farmer_smart_inbox (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies (id) on delete cascade,
  clerk_user_id text not null,
  slot text not null check (slot in ('morning', 'evening', 'weekly')),
  category text not null,
  title text not null,
  body text not null,
  metadata jsonb not null default '{}'::jsonb,
  dismissed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists farmer_smart_inbox_user_company_created_idx
  on public.farmer_smart_inbox (clerk_user_id, company_id, created_at desc);

alter table public.farmer_smart_messaging_state enable row level security;
alter table public.farmer_smart_inbox enable row level security;

-- No direct client access to rotation state (Edge Function / service role only).
drop policy if exists farmer_smart_messaging_state_service on public.farmer_smart_messaging_state;
create policy farmer_smart_messaging_state_service on public.farmer_smart_messaging_state
  for all
  using (false)
  with check (false);

drop policy if exists farmer_smart_inbox_select on public.farmer_smart_inbox;
create policy farmer_smart_inbox_select on public.farmer_smart_inbox
  for select
  using (
    clerk_user_id = (auth.jwt() ->> 'sub')
    and exists (
      select 1
      from core.company_members m
      where m.company_id = farmer_smart_inbox.company_id
        and m.clerk_user_id = (auth.jwt() ->> 'sub')
    )
  );

drop policy if exists farmer_smart_inbox_update on public.farmer_smart_inbox;
create policy farmer_smart_inbox_update on public.farmer_smart_inbox
  for update
  using (clerk_user_id = (auth.jwt() ->> 'sub'))
  with check (clerk_user_id = (auth.jwt() ->> 'sub'));

grant select, update on public.farmer_smart_inbox to authenticated;
grant all on public.farmer_smart_messaging_state to service_role;
grant all on public.farmer_smart_inbox to service_role;

comment on table public.farmer_smart_inbox is
  'Farmer smart daily / weekly messages for in-app display; written by engagement-email-cron (service role).';

-- ---------------------------------------------------------------------------
-- Reschedule engagement crons (Nairobi-oriented)
-- ---------------------------------------------------------------------------

do $reschedule$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron not available; smart messaging cron times not updated.';
    return;
  end if;

  if not exists (
    select 1
    from vault.decrypted_secrets
    where name = 'engagement_email_project_url'
    limit 1
  ) or not exists (
    select 1
    from vault.decrypted_secrets
    where name = 'engagement_email_cron_secret'
    limit 1
  ) then
    raise notice
      'Vault secrets missing; smart messaging cron times not updated (tables still created).';
    return;
  end if;

  perform cron.unschedule(jobid)
  from cron.job
  where jobname in (
    'farmvault_engagement_morning',
    'farmvault_engagement_evening',
    'farmvault_engagement_weekly'
  );

  perform cron.schedule(
    'farmvault_engagement_morning',
    '30 3 * * *',
    $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'engagement_email_project_url' limit 1)
        || '/functions/v1/engagement-email-cron',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'engagement_email_cron_secret' limit 1)
      ),
      body := '{"run":"morning"}'::jsonb
    );
    $job$
  );

  -- 7:00 PM EAT Mon–Sat (evening smart message)
  perform cron.schedule(
    'farmvault_engagement_evening',
    '0 16 * * 1-6',
    $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'engagement_email_project_url' limit 1)
        || '/functions/v1/engagement-email-cron',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'engagement_email_cron_secret' limit 1)
      ),
      body := '{"run":"evening"}'::jsonb
    );
    $job$
  );

  -- Sunday 7:00 PM EAT — weekly summary only
  perform cron.schedule(
    'farmvault_engagement_weekly',
    '0 16 * * 0',
    $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'engagement_email_project_url' limit 1)
        || '/functions/v1/engagement-email-cron',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'engagement_email_cron_secret' limit 1)
      ),
      body := '{"run":"weekly"}'::jsonb
    );
    $job$
  );

  raise notice 'FarmVault smart messaging cron times applied (03:30 UTC morning, 16:00 UTC evening Mon–Sat, 16:00 UTC Sunday weekly).';
exception
  when undefined_table then
    raise notice 'vault.decrypted_secrets not available; cron times not updated.';
end
$reschedule$;

commit;
