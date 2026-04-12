-- Optional: pg_cron every 30 minutes → Edge `system-health-check` (read-only domain checks + log + email).
--
-- Prerequisites:
--   1) Deploy `system-health-check`; Edge secrets: SYSTEM_HEALTH_CHECK_SECRET, SUPABASE_*,
--      FARMVAULT_EMAIL_INTERNAL_SECRET, SYSTEM_HEALTH_ALERT_EMAIL (or LAUNCH_MONITORING_ALERT_EMAIL).
--   2) Vault:
--        select vault.create_secret('https://YOUR_PROJECT_REF.supabase.co', 'system_health_project_url');
--        select vault.create_secret('SAME_AS_SYSTEM_HEALTH_CHECK_SECRET', 'system_health_cron_secret');
--   3) Extensions: pg_cron, pg_net

begin;

do $drop$
declare
  r record;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    for r in select jobid from cron.job where jobname = 'farmvault_system_health_check'
    loop
      perform cron.unschedule(r.jobid);
    end loop;
  end if;
exception
  when undefined_table then
    null;
end
$drop$;

do $schedule$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron not available; system health cron skipped.';
    return;
  end if;

  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise notice 'pg_net not available; system health cron skipped.';
    return;
  end if;

  if not exists (
    select 1 from vault.decrypted_secrets where name = 'system_health_project_url' limit 1
  ) or not exists (
    select 1 from vault.decrypted_secrets where name = 'system_health_cron_secret' limit 1
  ) then
    raise notice
      'System health cron not scheduled: add Vault secrets system_health_project_url and system_health_cron_secret.';
    return;
  end if;

  perform cron.schedule(
    'farmvault_system_health_check',
    '*/30 * * * *',
    $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'system_health_project_url' limit 1)
        || '/functions/v1/system-health-check',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'system_health_cron_secret' limit 1)
      ),
      body := '{}'::jsonb
    );
    $job$
  );
end
$schedule$;

commit;

notify pgrst, 'reload schema';
