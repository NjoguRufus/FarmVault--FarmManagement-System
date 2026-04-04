-- Auto-activate paid subscription after successful M-Pesa STK callback (service_role only).

begin;

create or replace function public.activate_subscription_from_mpesa_stk(_checkout_request_id text)
returns void
language plpgsql
security definer
set search_path = admin, core, public
as $$
declare
  v_payment record;
  v_company_id uuid;
  v_plan text;
  v_cycle text;
  v_active_until timestamptz;
  v_now timestamptz := clock_timestamp();
  v_receipt text;
begin
  if _checkout_request_id is null or btrim(_checkout_request_id) = '' then
    raise exception 'checkout_request_id required' using errcode = 'P0001';
  end if;

  select *
  into v_payment
  from public.mpesa_payments
  where checkout_request_id = btrim(_checkout_request_id);

  if not found then
    raise exception 'Payment not found: %', _checkout_request_id using errcode = 'P0001';
  end if;

  if coalesce(v_payment.result_code, -1) <> 0 then
    raise exception 'Payment not successful for: %', _checkout_request_id using errcode = 'P0001';
  end if;

  if coalesce(v_payment.subscription_activated, false) then
    return;
  end if;

  if v_payment.company_id is null then
    raise exception 'mpesa_payments row missing company_id' using errcode = 'P0001';
  end if;

  v_company_id := v_payment.company_id::uuid;

  v_plan := lower(trim(coalesce(v_payment.plan, 'basic')));
  if v_plan not in ('basic', 'pro') then
    v_plan := case when v_plan like '%pro%' then 'pro' else 'basic' end;
  end if;

  v_cycle := lower(trim(coalesce(v_payment.billing_cycle, 'monthly')));
  if v_cycle = 'seasonal' then
    v_active_until := v_now + interval '3 months';
  elsif v_cycle = 'annual' then
    v_active_until := v_now + interval '1 year';
  else
    v_cycle := 'monthly';
    v_active_until := v_now + interval '1 month';
  end if;

  v_receipt := nullif(trim(coalesce(v_payment.mpesa_receipt, '')), '');

  insert into public.company_subscriptions (
    company_id,
    plan_id,
    plan_code,
    plan,
    status,
    billing_mode,
    billing_cycle,
    is_trial,
    trial_started_at,
    trial_starts_at,
    trial_ends_at,
    current_period_start,
    current_period_end,
    active_until,
    approved_at,
    approved_by,
    updated_at,
    updated_by
  )
  values (
    v_company_id,
    v_plan,
    v_plan,
    v_plan,
    'active',
    'mpesa_stk',
    v_cycle,
    false,
    null,
    null,
    null,
    v_now,
    v_active_until,
    v_active_until,
    v_now,
    'mpesa_stk',
    v_now,
    'mpesa_stk'
  )
  on conflict (company_id) do update set
    plan_id = excluded.plan_id,
    plan_code = excluded.plan_code,
    plan = excluded.plan,
    status = 'active',
    billing_mode = 'mpesa_stk',
    billing_cycle = excluded.billing_cycle,
    is_trial = false,
    trial_started_at = null,
    trial_starts_at = null,
    trial_ends_at = null,
    current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end,
    active_until = excluded.active_until,
    approved_at = excluded.approved_at,
    approved_by = excluded.approved_by,
    updated_at = excluded.updated_at,
    updated_by = excluded.updated_by;

  update core.companies
  set
    plan = v_plan,
    payment_confirmed = true,
    pending_confirmation = false,
    active_until = v_active_until,
    trial_ends_at = null,
    updated_at = v_now
  where id = v_company_id;

  insert into public.subscription_payments (
    company_id,
    plan_id,
    amount,
    status,
    billing_mode,
    payment_method,
    transaction_code,
    billing_cycle,
    notes,
    currency,
    created_at,
    submitted_at,
    approved_at,
    reviewed_at,
    reviewed_by
  )
  values (
    v_company_id::text,
    v_plan,
    coalesce(v_payment.amount, 0),
    'approved',
    'mpesa_stk',
    'mpesa_stk',
    v_receipt,
    v_cycle,
    'Auto-activated via M-Pesa STK. Receipt: ' || coalesce(v_receipt, 'N/A'),
    'KES',
    v_now,
    v_now,
    v_now,
    v_now,
    'mpesa_stk'
  );

  update public.mpesa_payments
  set subscription_activated = true
  where checkout_request_id = btrim(_checkout_request_id);
end;
$$;

revoke all on function public.activate_subscription_from_mpesa_stk(text) from public;
grant execute on function public.activate_subscription_from_mpesa_stk(text) to service_role;

commit;

notify pgrst, 'reload schema';
