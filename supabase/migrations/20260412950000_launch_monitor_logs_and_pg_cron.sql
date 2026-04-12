-- Launch monitoring: audit log + service_role-only metrics RPC + optional pg_cron → Edge `launch-monitoring-report`.
--
-- Prerequisites (hosted Supabase):
--   1) Deploy Edge Function `launch-monitoring-report` (--no-verify-jwt). Set secrets:
--        SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
--        LAUNCH_MONITORING_REPORT_SECRET (long random),
--        FARMVAULT_EMAIL_INTERNAL_SECRET (must match send-farmvault-email),
--        LAUNCH_MONITORING_ALERT_EMAIL (developer inbox),
--        SUPABASE_ANON_KEY (optional; service role used for gateway if unset).
--   2) Vault (for pg_cron only):
--        select vault.create_secret('https://YOUR_PROJECT_REF.supabase.co', 'launch_monitoring_project_url');
--        select vault.create_secret('SAME_VALUE_AS_LAUNCH_MONITORING_REPORT_SECRET', 'launch_monitoring_cron_secret');
--   3) Enable extensions: pg_cron, pg_net (see engagement migration).
--
-- Schedule: hourly at :05 UTC (tune in cron.job after apply).

begin;

-- ---------------------------------------------------------------------------
-- 1) Append-only log (Edge inserts via service_role)
-- ---------------------------------------------------------------------------
create table if not exists public.launch_monitor_logs (
  id uuid primary key default gen_random_uuid(),
  status text not null,
  metrics jsonb not null default '{}'::jsonb,
  email_sent boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.launch_monitor_logs is
  'Automated launch monitoring evaluations (metrics snapshot + whether a notification email was sent).';

create index if not exists launch_monitor_logs_created_at_idx
  on public.launch_monitor_logs (created_at desc);

create index if not exists launch_monitor_logs_email_sent_created_idx
  on public.launch_monitor_logs (created_at desc)
  where email_sent;

alter table public.launch_monitor_logs enable row level security;

grant select, insert on table public.launch_monitor_logs to service_role;

-- ---------------------------------------------------------------------------
-- 2) Metrics snapshot (service_role JWT only — called from launch-monitoring-report Edge)
-- ---------------------------------------------------------------------------
create or replace function public.launch_monitoring_collect_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  orphan bigint := 0;
  stuck bigint := 0;
  failed bigint := 0;
  manual bigint := 0;
begin
  if coalesce(auth.role()::text, '') is distinct from 'service_role' then
    raise exception 'launch_monitoring_collect_metrics: service_role only' using errcode = '42501';
  end if;

  if to_regclass('public.mpesa_payments') is not null and to_regclass('public.mpesa_stk_callbacks') is not null then
    select count(*)::bigint into orphan
    from public.mpesa_stk_callbacks c
    left join public.mpesa_payments p
      on p.checkout_request_id is not null
     and c.checkout_request_id is not null
     and p.checkout_request_id = c.checkout_request_id
    where coalesce(nullif(btrim(c.checkout_request_id), ''), null) is not null
      and p.id is null;
  end if;

  if to_regclass('public.mpesa_payments') is not null then
    select count(*)::bigint into stuck
    from public.mpesa_payments
    where upper(trim(coalesce(status, ''))) = 'PENDING'
      and created_at < now() - interval '10 minutes';

    select count(*)::bigint into failed
    from public.mpesa_payments
    where upper(trim(coalesce(status, ''))) = 'FAILED'
      and created_at >= now() - interval '24 hours';
  end if;

  if to_regclass('public.subscription_payments') is not null then
    select count(*)::bigint into manual
    from public.subscription_payments
    where status = 'pending_verification'::public.subscription_payment_status;
  end if;

  return jsonb_build_object(
    'orphan_callbacks', orphan,
    'stuck_pending_payments', stuck,
    'failed_payments_24h', failed,
    'pending_manual_approvals', manual
  );
end;
$$;

comment on function public.launch_monitoring_collect_metrics() is
  'Returns M-Pesa / manual payment counts for launch monitoring (callable only with service_role JWT).';

revoke all on function public.launch_monitoring_collect_metrics() from public;
grant execute on function public.launch_monitoring_collect_metrics() to service_role;

-- ---------------------------------------------------------------------------
-- 3) Optional pg_cron → Edge (requires Vault secrets)
-- ---------------------------------------------------------------------------
do $drop$
declare
  r record;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    for r in select jobid from cron.job where jobname = 'farmvault_launch_monitoring_report'
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
    raise notice 'pg_cron not available; launch monitoring cron skipped.';
    return;
  end if;

  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise notice 'pg_net not available; launch monitoring cron skipped.';
    return;
  end if;

  if not exists (
    select 1 from vault.decrypted_secrets where name = 'launch_monitoring_project_url' limit 1
  ) or not exists (
    select 1 from vault.decrypted_secrets where name = 'launch_monitoring_cron_secret' limit 1
  ) then
    raise notice
      'Launch monitoring cron not scheduled: add Vault secrets launch_monitoring_project_url and launch_monitoring_cron_secret (see migration header).';
    return;
  end if;

  perform cron.schedule(
    'farmvault_launch_monitoring_report',
    '5 * * * *',
    $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'launch_monitoring_project_url' limit 1)
        || '/functions/v1/launch-monitoring-report',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'launch_monitoring_cron_secret' limit 1)
      ),
      body := '{}'::jsonb
    );
    $job$
  );
end
$schedule$;

commit;

notify pgrst, 'reload schema';
