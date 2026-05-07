-- Smart Companion Notification System: user preferences + tiered inactivity tracking.
-- notification_preferences: per-user channel and type opt-in/opt-out.
-- companion_inactivity_log: records which inactivity tier was sent, preventing repeats.

begin;

-- ---------------------------------------------------------------------------
-- notification_preferences
-- ---------------------------------------------------------------------------

create table if not exists public.notification_preferences (
  id                      uuid        primary key default gen_random_uuid(),
  clerk_user_id           text        not null unique,
  morning_enabled         boolean     not null default true,
  evening_enabled         boolean     not null default true,
  inactivity_enabled      boolean     not null default true,
  weekly_summary_enabled  boolean     not null default true,
  email_enabled           boolean     not null default true,
  in_app_enabled          boolean     not null default true,
  preferred_time_zone     text        not null default 'Africa/Nairobi',
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists notification_preferences_clerk_user_id_idx
  on public.notification_preferences (clerk_user_id);

alter table public.notification_preferences enable row level security;

drop policy if exists notification_preferences_own on public.notification_preferences;
create policy notification_preferences_own on public.notification_preferences
  for all
  using  (clerk_user_id = (auth.jwt() ->> 'sub'))
  with check (clerk_user_id = (auth.jwt() ->> 'sub'));

grant select, insert, update, delete on public.notification_preferences to authenticated;
grant all                             on public.notification_preferences to service_role;

comment on table public.notification_preferences is
  'Per-user companion notification channel and type preferences. '
  'Written by the frontend settings panel; read by engagement-email-cron (service role).';

-- ---------------------------------------------------------------------------
-- companion_inactivity_log
-- ---------------------------------------------------------------------------

create table if not exists public.companion_inactivity_log (
  id            uuid        primary key default gen_random_uuid(),
  clerk_user_id text        not null,
  company_id    uuid        not null references core.companies (id) on delete cascade,
  tier          text        not null check (tier in ('2d', '5d', '7d', '14d')),
  -- ISO week start date (Sunday UTC), computed and supplied by the Edge Function at insert time.
  -- Stored as a plain column so the unique index expression stays IMMUTABLE.
  week_start    date        not null,
  sent_at       timestamptz not null default now()
);

-- One nudge per tier per user per UTC week (Sunday-based).
create unique index if not exists companion_inactivity_log_tier_week_uidx
  on public.companion_inactivity_log (clerk_user_id, company_id, tier, week_start);

create index if not exists companion_inactivity_log_user_sent_idx
  on public.companion_inactivity_log (clerk_user_id, company_id, sent_at desc);

alter table public.companion_inactivity_log enable row level security;

-- Service role (Edge Function) writes; no direct client access needed.
drop policy if exists companion_inactivity_log_service on public.companion_inactivity_log;
create policy companion_inactivity_log_service on public.companion_inactivity_log
  for all
  using  (false)
  with check (false);

grant all on public.companion_inactivity_log to service_role;

comment on table public.companion_inactivity_log is
  'Records which inactivity nudge tier (2d/5d/7d/14d) was sent per user per week. '
  'Written by engagement-email-cron (service role) to prevent repeat nudges.';

-- ---------------------------------------------------------------------------
-- Reschedule: add daily inactivity cron at 09:00 UTC (noon EAT)
-- ---------------------------------------------------------------------------

do $add_inactivity_cron$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron not available; inactivity cron not scheduled.';
    return;
  end if;

  if not exists (
    select 1 from vault.decrypted_secrets
    where name = 'engagement_email_project_url' limit 1
  ) or not exists (
    select 1 from vault.decrypted_secrets
    where name = 'engagement_email_cron_secret' limit 1
  ) then
    raise notice 'Vault secrets missing; inactivity cron not scheduled (tables still created).';
    return;
  end if;

  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'farmvault_engagement_inactivity';

  -- 09:00 UTC daily = 12:00 EAT
  perform cron.schedule(
    'farmvault_engagement_inactivity',
    '0 9 * * *',
    $job$
    select net.http_post(
      url := (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'engagement_email_project_url'
        limit 1
      ) || '/functions/v1/engagement-email-cron',
      headers := jsonb_build_object(
        'Content-Type',   'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'engagement_email_cron_secret'
          limit 1
        )
      ),
      body := '{"run":"inactivity"}'::jsonb
    );
    $job$
  );

  raise notice 'FarmVault inactivity cron scheduled at 09:00 UTC daily.';
exception
  when undefined_table then
    raise notice 'vault.decrypted_secrets not available; inactivity cron not scheduled.';
end
$add_inactivity_cron$;

commit;
