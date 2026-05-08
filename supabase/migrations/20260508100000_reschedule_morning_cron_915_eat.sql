-- Reschedule morning companion email to 09:15 EAT (06:15 UTC).

begin;

do $reschedule$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron not available; morning cron not updated.';
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

  perform cron.unschedule(jobid) from cron.job where jobname = 'farmvault_engagement_morning';

  perform cron.schedule(
    'farmvault_engagement_morning',
    '15 6 * * *',
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

  raise notice 'FarmVault morning cron updated: 06:15 UTC (09:15 EAT) daily.';
exception
  when undefined_table then
    raise notice 'vault.decrypted_secrets not available; cron not updated.';
end
$reschedule$;

commit;
