-- Daily trial reminder emails via existing engagement-email-cron (same Vault secrets as 20260405120000).

begin;

do $schedule_trial$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron not available; trial email cron skipped.';
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
      'Trial email cron not scheduled: add Vault secrets engagement_email_project_url and engagement_email_cron_secret.';
    return;
  end if;

  perform cron.unschedule(jobid)
  from cron.job
  where jobname in ('farmvault_trial_expiring', 'farmvault_trial_expired');

  perform cron.schedule(
    'farmvault_trial_expiring',
    '15 7 * * *',
    $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'engagement_email_project_url' limit 1)
        || '/functions/v1/engagement-email-cron',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'engagement_email_cron_secret' limit 1)
      ),
      body := '{"run":"trial_expiring"}'::jsonb
    );
    $job$
  );

  perform cron.schedule(
    'farmvault_trial_expired',
    '30 7 * * *',
    $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'engagement_email_project_url' limit 1)
        || '/functions/v1/engagement-email-cron',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'engagement_email_cron_secret' limit 1)
      ),
      body := '{"run":"trial_expired"}'::jsonb
    );
    $job$
  );

  raise notice 'FarmVault trial email cron jobs registered (07:15 UTC expiring, 07:30 UTC expired).';
exception
  when undefined_table then
    raise notice 'vault.decrypted_secrets not available; trial email cron skipped.';
end
$schedule_trial$;

commit;
