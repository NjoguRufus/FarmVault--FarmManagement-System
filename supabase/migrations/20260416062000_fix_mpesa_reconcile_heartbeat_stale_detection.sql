begin;

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
     and not coalesce(public.is_developer(), false)
     and current_user not in ('postgres', 'supabase_admin') then
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
    where action_taken in ('reconcile_job_started', 'reconcile_job_completed', 'reconcile_job_summary');
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

commit;

notify pgrst, 'reload schema';
