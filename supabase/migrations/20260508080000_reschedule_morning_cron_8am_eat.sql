-- Reschedule morning companion email from 6:30 AM EAT → 8:00 AM EAT.
--
-- UTC mapping (EAT = UTC+3):
--   Morning    08:00 EAT = 05:00 UTC  →  '0 5 * * *'
--   Evening    19:00 EAT = 16:00 UTC  →  '0 16 * * 1-6'   (Mon–Sat, unchanged)
--   Weekly     19:00 EAT = 16:00 UTC  →  '0 16 * * 0'     (Sunday, unchanged)
--   Inactivity 12:00 EAT = 09:00 UTC  →  '0 9 * * *'      (daily noon, unchanged)

begin;

do $reschedule_morning$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron not available; morning cron time not updated.';
    return;
  end if;

  if not exists (
    select 1 from vault.decrypted_secrets
    where name = 'engagement_email_project_url' limit 1
  ) or not exists (
    select 1 from vault.decrypted_secrets
    where name = 'engagement_email_cron_secret' limit 1
  ) then
    raise notice 'Vault secrets missing; morning cron not updated.';
    return;
  end if;

  -- Unschedule whatever morning job currently exists
  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'farmvault_engagement_morning';

  -- Register at 05:00 UTC = 08:00 EAT daily
  perform cron.schedule(
    'farmvault_engagement_morning',
    '0 5 * * *',
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

  raise notice 'FarmVault morning cron updated: 05:00 UTC (08:00 EAT) daily.';
exception
  when undefined_table then
    raise notice 'vault.decrypted_secrets not available; cron not updated.';
end
$reschedule_morning$;

commit;
