-- Scheduled FarmVault engagement emails: pg_cron + pg_net → Edge Function engagement-email-cron (Resend).
--
-- Prerequisites (hosted Supabase):
--   1) Edge Function secrets: RESEND_API_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL,
--      ENGAGEMENT_EMAIL_CRON_SECRET (generate a long random string).
--   2) Vault secrets (Dashboard → Project Settings → Vault, or SQL):
--        select vault.create_secret('https://YOUR_PROJECT_REF.supabase.co', 'engagement_email_project_url');
--        select vault.create_secret('SAME_VALUE_AS_ENGAGEMENT_EMAIL_CRON_SECRET', 'engagement_email_cron_secret');
--   3) Deploy: npx supabase functions deploy engagement-email-cron --no-verify-jwt
--
-- Cron times are UTC: morning 08:00, evening 18:00, weekly Sunday 18:00, inactivity check 09:00 daily.

begin;

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Drop previous jobs if re-applying migration
do $drop_engagement$
declare
  r record;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    for r in select jobid from cron.job where jobname like 'farmvault_engagement_%'
    loop
      perform cron.unschedule(r.jobid);
    end loop;
  end if;
exception
  when undefined_table then
    null;
end
$drop_engagement$;

do $schedule_engagement$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron not available; engagement cron schedules skipped.';
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
      'Engagement email cron not scheduled: add Vault secrets engagement_email_project_url and engagement_email_cron_secret (see migration header).';
    return;
  end if;

  perform cron.schedule(
    'farmvault_engagement_morning',
    '0 8 * * *',
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

  perform cron.schedule(
    'farmvault_engagement_evening',
    '0 18 * * *',
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

  perform cron.schedule(
    'farmvault_engagement_weekly',
    '0 18 * * 0',
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

  perform cron.schedule(
    'farmvault_engagement_inactivity',
    '0 9 * * *',
    $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'engagement_email_project_url' limit 1)
        || '/functions/v1/engagement-email-cron',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'engagement_email_cron_secret' limit 1)
      ),
      body := '{"run":"inactivity"}'::jsonb
    );
    $job$
  );

  raise notice 'FarmVault engagement email cron jobs registered (morning, evening, weekly Sunday, inactivity).';
exception
  when undefined_table then
    raise notice 'vault.decrypted_secrets not available; engagement cron schedules skipped.';
end
$schedule_engagement$;

commit;
