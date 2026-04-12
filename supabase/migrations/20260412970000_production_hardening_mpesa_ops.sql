-- Production hardening: M-Pesa orphan logging, reconcile attempt caps, developer payment diagnostics,
-- reconcile freshness signal for system_health_evaluate, optional merchant_request_id on mpesa_payments.
--
-- Cron / reconcile: see comment block at end of this file.

begin;

-- ---------------------------------------------------------------------------
-- 1) mpesa_orphan_attempts — failed STK DB steps / checkout binding failures (service_role inserts from Edge)
-- ---------------------------------------------------------------------------
create table if not exists public.mpesa_orphan_attempts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  edge_function text not null default 'mpesa-stk-push',
  mpesa_payment_id uuid references public.mpesa_payments (id) on delete set null,
  checkout_request_id text,
  idempotency_key text,
  company_id uuid references core.companies (id) on delete set null,
  error_message text,
  detail jsonb,
  resolved boolean not null default false
);

comment on table public.mpesa_orphan_attempts is
  'STK durability: rows when checkout binding / insert failed after Daraja call or other non-idempotent DB errors.';

create index if not exists mpesa_orphan_attempts_created_at_idx
  on public.mpesa_orphan_attempts (created_at desc);

create index if not exists mpesa_orphan_attempts_checkout_idx
  on public.mpesa_orphan_attempts (checkout_request_id)
  where checkout_request_id is not null and btrim(checkout_request_id) <> '';

alter table public.mpesa_orphan_attempts enable row level security;

grant select, insert on table public.mpesa_orphan_attempts to service_role;

-- ---------------------------------------------------------------------------
-- 2) mpesa_payments — merchant_request_id + reconcile_attempts (retry cap from reconcile Edge)
-- ---------------------------------------------------------------------------
alter table public.mpesa_payments
  add column if not exists merchant_request_id text;

comment on column public.mpesa_payments.merchant_request_id is
  'Daraja MerchantRequestID from STK initiation response (helps recovery when checkout_request_id binding is delayed).';

alter table public.mpesa_payments
  add column if not exists reconcile_attempts int not null default 0;

comment on column public.mpesa_payments.reconcile_attempts is
  'Automated mpesa-payment-reconcile passes that attempted Daraja query / activation for this row (max 3).';

-- ---------------------------------------------------------------------------
-- 3) Developer / ops: check_payment_status(checkout_request_id) — read-only aggregate
-- ---------------------------------------------------------------------------
create or replace function public.check_payment_status(p_checkout text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ck text := nullif(btrim(coalesce(p_checkout, '')), '');
  v_pay jsonb := 'null'::jsonb;
  v_cb jsonb := '[]'::jsonb;
begin
  if v_ck is null then
    raise exception 'checkout_request_id required' using errcode = 'P0001';
  end if;

  if coalesce(auth.role()::text, '') is distinct from 'service_role'
     and not coalesce(public.is_developer(), false) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select to_jsonb(mp.*)
  into v_pay
  from public.mpesa_payments mp
  where mp.checkout_request_id is not distinct from v_ck
  limit 1;

  select coalesce(jsonb_agg(to_jsonb(c.*) order by c.created_at desc), '[]'::jsonb)
  into v_cb
  from public.mpesa_stk_callbacks c
  where c.checkout_request_id is not distinct from v_ck;

  return jsonb_build_object(
    'checkout_request_id', to_jsonb(v_ck),
    'mpesa_payment', coalesce(v_pay, 'null'::jsonb),
    'stk_callbacks', v_cb,
    'activation', jsonb_build_object(
      'subscription_activated',
      coalesce((v_pay->>'subscription_activated')::boolean, false),
      'success_processed',
      coalesce((v_pay->>'success_processed')::boolean, false),
      'status', v_pay->>'status',
      'result_code', v_pay->>'result_code'
    )
  );
end;
$$;

comment on function public.check_payment_status(text) is
  'Read-only: mpesa_payments row + stk_callbacks for a CheckoutRequestID (developers or service_role).';

revoke all on function public.check_payment_status(text) from public;
grant execute on function public.check_payment_status(text) to authenticated;
grant execute on function public.check_payment_status(text) to service_role;

-- ---------------------------------------------------------------------------
-- 4) system_health_evaluate — alert when automated reconcile heartbeat is stale (>1h) while pipeline active
-- ---------------------------------------------------------------------------
create or replace function public.system_health_evaluate(p_write_log boolean default false)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_stuck int := 0;
  v_orphan int := 0;
  v_webhook int := 0;
  v_manual_stale int := 0;
  v_has_trace boolean := false;
  v_recent boolean := false;
  v_activity_ok boolean := true;
  v_issues jsonb := '[]'::jsonb;
  v_status text := 'ok';
  v_result jsonb;
  v_msg text;
  v_last_reconcile timestamptz;
  v_pipeline_7d boolean := false;
  v_reconcile_stale boolean := false;
begin
  if coalesce(auth.role()::text, '') is distinct from 'service_role'
     and not coalesce(public.is_developer(), false) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if to_regclass('public.mpesa_payments') is not null then
    select count(*)::int into v_stuck
    from public.mpesa_payments mp
    where lower(trim(coalesce(mp.status, ''))) = 'pending'
      and mp.created_at < now() - interval '10 minutes'
      and mp.checkout_request_id is not null
      and btrim(mp.checkout_request_id) <> '';

    select count(*)::int into v_orphan
    from public.mpesa_payments mp
    where mp.company_id is not null
      and coalesce(mp.subscription_activated, false) = false
      and (
        lower(trim(coalesce(mp.status, ''))) = 'success'
        or coalesce(mp.result_code, -1) = 0
      );
  end if;

  if to_regclass('public.payment_webhook_failures') is not null then
    select count(*)::int into v_webhook
    from public.payment_webhook_failures f
    where f.resolved_at is null;
  end if;

  if to_regclass('public.subscription_payments') is not null then
    select count(*)::int into v_manual_stale
    from public.subscription_payments sp
    where sp.status = 'pending_verification'::public.subscription_payment_status
      and coalesce(sp.submitted_at, sp.created_at) < now() - interval '1 hour';
  end if;

  if to_regclass('public.mpesa_payments') is not null then
    select exists (select 1 from public.mpesa_payments limit 1) into v_has_trace;
  end if;
  if not v_has_trace and to_regclass('public.mpesa_stk_callbacks') is not null then
    select exists (select 1 from public.mpesa_stk_callbacks limit 1) into v_has_trace;
  end if;

  if v_has_trace then
    v_recent := false;
    if to_regclass('public.mpesa_payments') is not null then
      select exists (
        select 1 from public.mpesa_payments mp2 where mp2.created_at > now() - interval '24 hours'
      ) into v_recent;
    end if;
    if not coalesce(v_recent, false) and to_regclass('public.mpesa_stk_callbacks') is not null then
      select exists (
        select 1 from public.mpesa_stk_callbacks c where c.created_at > now() - interval '24 hours'
      ) into v_recent;
    end if;
    v_activity_ok := coalesce(v_recent, false);
  end if;

  if to_regclass('public.mpesa_payments') is not null then
    select exists (
      select 1 from public.mpesa_payments mp3 where mp3.created_at > now() - interval '7 days'
    ) into v_pipeline_7d;
  end if;
  if not coalesce(v_pipeline_7d, false) and to_regclass('public.mpesa_stk_callbacks') is not null then
    select exists (
      select 1 from public.mpesa_stk_callbacks c2 where c2.created_at > now() - interval '7 days'
    ) into v_pipeline_7d;
  end if;

  if to_regclass('public.payment_reconciliation_log') is not null then
    select max(created_at) into v_last_reconcile
    from public.payment_reconciliation_log
    where action_taken in ('reconcile_job_completed', 'reconcile_job_summary');
  end if;

  v_reconcile_stale := coalesce(v_pipeline_7d, false)
    and (
      v_last_reconcile is null
      or v_last_reconcile < now() - interval '1 hour'
    );

  if v_stuck > 0 then
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'type', 'stuck_payment',
      'count', v_stuck,
      'message', format('%s STK payment(s) stuck in pending for over 10 minutes', v_stuck),
      'severity', 'critical'
    ));
  end if;

  if v_orphan > 0 then
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'type', 'orphan_payment',
      'count', v_orphan,
      'message', format('%s successful payment(s) without subscription activation', v_orphan),
      'severity', 'critical'
    ));
  end if;

  if v_webhook > 0 then
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'type', 'failed_callback',
      'count', v_webhook,
      'message', format('%s unresolved payment webhook failure(s)', v_webhook),
      'severity', 'warning'
    ));
  end if;

  if v_manual_stale > 0 then
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'type', 'manual_pending_stale',
      'count', v_manual_stale,
      'message', format('%s manual payment(s) pending verification for over 1 hour', v_manual_stale),
      'severity', 'warning'
    ));
  end if;

  if v_has_trace and not v_activity_ok then
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'type', 'system_quiet',
      'count', 0,
      'message', 'No payment pipeline activity in the last 24 hours',
      'severity', 'warning'
    ));
  end if;

  if v_reconcile_stale then
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'type', 'mpesa_reconcile_stale',
      'count', 1,
      'message', 'mpesa-payment-reconcile heartbeat older than 1 hour (or never logged) while M-Pesa activity exists in the last 7 days',
      'severity', 'critical'
    ));
    if p_write_log then
      insert into public.system_health_logs (check_type, status, message, metadata)
      values (
        'mpesa_reconcile_stale',
        'alert',
        'Reconcile job may not be running on schedule',
        jsonb_build_object(
          'last_reconcile_log_at', to_jsonb(v_last_reconcile),
          'pipeline_active_7d', to_jsonb(v_pipeline_7d)
        )
      );
    end if;
  end if;

  if v_stuck > 0 or v_orphan > 0 or v_reconcile_stale then
    v_status := 'critical';
  elsif v_webhook > 0 or v_manual_stale > 0 or (v_has_trace and not v_activity_ok) then
    v_status := 'warning';
  else
    v_status := 'ok';
  end if;

  v_result := jsonb_build_object(
    'status', v_status,
    'issues', coalesce(v_issues, '[]'::jsonb),
    'metrics', jsonb_build_object(
      'stuck_payments', v_stuck,
      'orphan_payments', v_orphan,
      'failed_callbacks', v_webhook,
      'manual_pending_over_1h', v_manual_stale,
      'pipeline_active_24h', v_activity_ok,
      'mpesa_reconcile_stale', v_reconcile_stale,
      'last_reconcile_log_at', to_jsonb(v_last_reconcile)
    ),
    'checked_at', to_jsonb(now())
  );

  if p_write_log then
    v_msg := case v_status
      when 'critical' then 'Critical issues detected'
      when 'warning' then 'Warnings detected'
      else 'All checks passed'
    end;
    insert into public.system_health_logs (check_type, status, message, metadata)
    values ('system_health_v1', v_status, v_msg, v_result);
  end if;

  return v_result;
end;
$$;

comment on function public.system_health_evaluate(boolean) is
  'Read-only health snapshot on payments/webhooks/reconcile freshness; optional append-only log insert.';

-- ---------------------------------------------------------------------------
-- 5) launch_monitoring_collect_metrics — exclude in-flight rows with no Daraja checkout id from "stuck pending"
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
      and created_at < now() - interval '10 minutes'
      and checkout_request_id is not null
      and btrim(checkout_request_id) <> '';

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

revoke all on function public.system_health_evaluate(boolean) from public;
grant execute on function public.system_health_evaluate(boolean) to authenticated;
grant execute on function public.system_health_evaluate(boolean) to service_role;

commit;

notify pgrst, 'reload schema';

-- ===========================================================================
-- CRON + RECONCILE OPS (manual steps)
-- ===========================================================================
-- 1) Deploy Edge:  npx supabase functions deploy mpesa-payment-reconcile --no-verify-jwt
-- 2) Set secrets:  MPESA_RECONCILE_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MPESA_* (same as STK).
-- 3) Schedule (pick one):
--    A) Supabase Dashboard → Edge Functions → mpesa-payment-reconcile → Schedules: POST every 10–15 minutes
--       Body: {}  Header: Authorization: Bearer <MPESA_RECONCILE_SECRET>
--    B) External cron (GitHub Actions / Cloud Scheduler): POST
--         https://<ref>.supabase.co/functions/v1/mpesa-payment-reconcile
--       with same Authorization header.
--    C) pg_cron + pg_net (optional): mirror pattern in 20260412950000_launch_monitor_logs_and_pg_cron.sql
--       using Vault secrets for project URL + bearer secret.
-- 4) system-health-check (existing): schedule per 20260412961000_system_health_pg_cron.sql so
--    `system_health_evaluate` can emit mpesa_reconcile_stale when reconcile heartbeats stop.
-- ===========================================================================
