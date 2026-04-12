-- Sprint 1: optional pg_cron → mpesa-payment-reconcile (STK Query + stuck SUCCESS activation).
--
-- Prerequisites (hosted Supabase):
--   1) Edge Function `mpesa-payment-reconcile` deployed; secret MPESA_RECONCILE_SECRET set (long random).
--   2) Vault secrets (Dashboard → SQL or UI):
--        select vault.create_secret('https://YOUR_PROJECT_REF.supabase.co', 'mpesa_reconcile_project_url');
--        select vault.create_secret('SAME_VALUE_AS_MPESA_RECONCILE_SECRET', 'mpesa_reconcile_bearer_secret');
--   3) Enable extensions: pg_cron, pg_net (see engagement migration pattern).
--
-- Schedule: every 15 minutes UTC. Tune in cron.job after apply.

begin;

do $drop$
declare
  r record;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    for r in select jobid from cron.job where jobname = 'farmvault_mpesa_payment_reconcile'
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
    raise notice 'pg_cron not available; mpesa reconcile cron skipped.';
    return;
  end if;

  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise notice 'pg_net not available; mpesa reconcile cron skipped.';
    return;
  end if;

  if not exists (
    select 1
    from vault.decrypted_secrets
    where name = 'mpesa_reconcile_project_url'
    limit 1
  ) or not exists (
    select 1
    from vault.decrypted_secrets
    where name = 'mpesa_reconcile_bearer_secret'
    limit 1
  ) then
    raise notice
      'mpesa reconcile cron not scheduled: add Vault secrets mpesa_reconcile_project_url and mpesa_reconcile_bearer_secret (see migration header).';
    return;
  end if;

  perform cron.schedule(
    'farmvault_mpesa_payment_reconcile',
    '*/15 * * * *',
    $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'mpesa_reconcile_project_url' limit 1)
        || '/functions/v1/mpesa-payment-reconcile',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'mpesa_reconcile_bearer_secret' limit 1)
      ),
      body := '{"minAgeMinutes":3,"limit":50}'::jsonb
    );
    $job$
  );
end
$schedule$;

commit;

notify pgrst, 'reload schema';
