-- Developer-only read-only aggregate metrics for launch monitoring (single round-trip).

begin;

create or replace function public.dev_launch_monitoring_metrics()
returns table (
  pending_stk_payments           bigint,
  failed_payments_24h            bigint,
  successful_payments_24h        bigint,
  orphan_stk_callbacks           bigint,
  pending_manual_approvals       bigint,
  payment_webhook_failures_24h   bigint,
  reconciliation_errors_24h      bigint,
  duplicate_transaction_codes_24h bigint,
  stuck_pending_stk_over_10m     bigint,
  active_companies_projects_24h  bigint,
  new_companies_24h              bigint
)
language plpgsql
stable
security definer
set search_path = public, core, projects
as $$
declare
  v_pending_stk bigint := 0;
  v_failed_24h bigint := 0;
  v_success_24h bigint := 0;
  v_orphans bigint := 0;
  v_manual_pending bigint := 0;
  v_webhook_fail_24h bigint := 0;
  v_recon_err_24h bigint := 0;
  v_dup_codes bigint := 0;
  v_stuck_pending bigint := 0;
  v_active_cos bigint := 0;
  v_new_cos bigint := 0;
begin
  if not public.is_developer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if to_regclass('public.mpesa_payments') is not null then
    select count(*)::bigint into v_pending_stk
    from public.mpesa_payments
    where upper(trim(coalesce(status, ''))) = 'PENDING';

    select count(*)::bigint into v_failed_24h
    from public.mpesa_payments
    where upper(trim(coalesce(status, ''))) = 'FAILED'
      and created_at >= now() - interval '24 hours';

    select count(*)::bigint into v_success_24h
    from public.mpesa_payments
    where upper(trim(coalesce(status, ''))) = 'SUCCESS'
      and created_at >= now() - interval '24 hours';

    select count(*)::bigint into v_stuck_pending
    from public.mpesa_payments
    where upper(trim(coalesce(status, ''))) = 'PENDING'
      and created_at < now() - interval '10 minutes';
  end if;

  if to_regclass('public.mpesa_stk_callbacks') is not null
     and to_regclass('public.mpesa_payments') is not null then
    select count(*)::bigint into v_orphans
    from public.mpesa_stk_callbacks c
    left join public.mpesa_payments p
      on p.checkout_request_id is not null
     and c.checkout_request_id is not null
     and p.checkout_request_id = c.checkout_request_id
    where coalesce(nullif(btrim(c.checkout_request_id), ''), null) is not null
      and p.id is null;
  end if;

  if to_regclass('public.subscription_payments') is not null then
    select count(*)::bigint into v_manual_pending
    from public.subscription_payments
    where status = 'pending_verification'::public.subscription_payment_status;

    select count(*)::bigint into v_dup_codes
    from (
      select sp.transaction_code
      from public.subscription_payments sp
      where sp.created_at >= now() - interval '24 hours'
        and sp.transaction_code is not null
        and btrim(sp.transaction_code::text) <> ''
      group by sp.transaction_code
      having count(*) > 1
    ) d;
  end if;

  if to_regclass('public.payment_webhook_failures') is not null then
    select count(*)::bigint into v_webhook_fail_24h
    from public.payment_webhook_failures
    where created_at >= now() - interval '24 hours';
  end if;

  if to_regclass('public.payment_reconciliation_log') is not null then
    select count(*)::bigint into v_recon_err_24h
    from public.payment_reconciliation_log
    where created_at >= now() - interval '24 hours'
      and action_taken is not null
      and action_taken ilike '%error%';
  end if;

  if to_regclass('projects.projects') is not null then
    execute $q$
      select count(distinct company_id)::bigint
      from projects.projects
      where updated_at >= now() - interval '24 hours'
    $q$ into v_active_cos;
  elsif to_regclass('public.projects') is not null then
    execute $q$
      select count(distinct company_id)::bigint
      from public.projects
      where updated_at >= now() - interval '24 hours'
    $q$ into v_active_cos;
  end if;

  if to_regclass('core.companies') is not null then
    select count(*)::bigint into v_new_cos
    from core.companies
    where created_at >= now() - interval '24 hours';
  end if;

  return query select
    v_pending_stk,
    v_failed_24h,
    v_success_24h,
    v_orphans,
    v_manual_pending,
    v_webhook_fail_24h,
    v_recon_err_24h,
    v_dup_codes,
    v_stuck_pending,
    v_active_cos,
    v_new_cos;
end;
$$;

comment on function public.dev_launch_monitoring_metrics() is
  'Developer-only aggregate counts for launch monitoring (read-only; SECURITY DEFINER).';

grant execute on function public.dev_launch_monitoring_metrics() to authenticated;

commit;
