-- Register all FarmVault engagement email cron jobs.
--
-- UTC mapping (EAT = UTC+3):
--   Morning    08:00 EAT = 05:00 UTC  →  '0 5 * * *'       (daily)
--   Evening    19:00 EAT = 16:00 UTC  →  '0 16 * * 1-6'    (Mon–Sat)
--   Weekly     19:00 EAT = 16:00 UTC  →  '0 16 * * 0'      (Sunday)
--   Inactivity 12:00 EAT = 09:00 UTC  →  '0 9 * * *'       (daily)

begin;

do $register_crons$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron not available; cron jobs not registered.';
    return;
  end if;

  if not exists (
    select 1 from vault.decrypted_secrets
    where name = 'engagement_email_project_url' limit 1
  ) or not exists (
    select 1 from vault.decrypted_secrets
    where name = 'engagement_email_cron_secret' limit 1
  ) then
    raise notice 'Vault secrets missing; cron jobs not registered.';
    return;
  end if;

  -- ── Evening (Mon–Sat 19:00 EAT) ───────────────────────────────────────────
  perform cron.unschedule(jobid) from cron.job where jobname = 'farmvault_engagement_evening';
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

  -- ── Weekly summary (Sunday 19:00 EAT) ─────────────────────────────────────
  perform cron.unschedule(jobid) from cron.job where jobname = 'farmvault_engagement_weekly';
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

  -- ── Inactivity (daily 12:00 EAT) ──────────────────────────────────────────
  perform cron.unschedule(jobid) from cron.job where jobname = 'farmvault_engagement_inactivity';
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

  raise notice 'FarmVault engagement cron jobs registered: evening, weekly, inactivity.';
exception
  when undefined_table then
    raise notice 'vault.decrypted_secrets not available; cron jobs not registered.';
end
$register_crons$;

commit;
