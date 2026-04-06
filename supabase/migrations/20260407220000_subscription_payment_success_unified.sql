-- Unified payment success: idempotency flags on subscription_payments.
-- Ambassador commission is awarded from Edge handleSuccessfulPayment only (removed from approve + STK SQL).

begin;

alter table public.subscription_payments
  add column if not exists success_processed boolean not null default false,
  add column if not exists success_email_sent boolean not null default false,
  add column if not exists commission_awarded boolean not null default false;

comment on column public.subscription_payments.success_processed is
  'True once handleSuccessfulPayment completed (company email, admin notify, commission, workspace sync).';
comment on column public.subscription_payments.success_email_sent is
  'True once the unified Payment Successful email was sent to the company.';
comment on column public.subscription_payments.commission_awarded is
  'True once ambassador subscription commission was applied or definitively skipped for this payment.';

alter table core.companies
  add column if not exists last_payment_at timestamptz;

comment on column core.companies.last_payment_at is
  'Timestamp of the last successfully confirmed subscription payment (STK or manual approval).';

-- ---------------------------------------------------------------------------
-- STK activation — commission handled in Edge only
-- ---------------------------------------------------------------------------
create or replace function public.activate_subscription_from_mpesa_stk(_checkout_request_id text)
returns uuid
language plpgsql
security definer
set search_path = admin, core, public
as $$
declare
  v_payment          record;
  v_company_id       uuid;
  v_plan             text;
  v_cycle            text;
  v_now              timestamptz := clock_timestamp();
  v_receipt          text;
  v_new_payment_id   uuid;
  v_cau              timestamptz;
  v_sub_stat         text;
  v_pay_conf         boolean;
  v_prep_overlap     boolean;
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
    if v_payment.company_id is null then
      raise exception 'mpesa_payments row missing company_id' using errcode = 'P0001';
    end if;

    select sp.id
    into v_new_payment_id
    from public.subscription_payments sp
    where lower(btrim(sp.company_id)) = lower(btrim(v_payment.company_id::text))
      and sp.billing_mode = 'mpesa_stk'
      and (
        sp.transaction_code = nullif(trim(coalesce(v_payment.mpesa_receipt, '')), '')
        or sp.notes like '%' || coalesce(v_payment.mpesa_receipt, '') || '%'
      )
    order by sp.created_at desc
    limit 1;

    return v_new_payment_id;
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
  if v_cycle not in ('monthly', 'seasonal', 'annual') then
    v_cycle := 'monthly';
  end if;

  v_receipt := nullif(trim(coalesce(v_payment.mpesa_receipt, '')), '');

  select c.active_until, c.subscription_status::text, coalesce(c.payment_confirmed, false)
  into v_cau, v_sub_stat, v_pay_conf
  from core.companies c
  where c.id = v_company_id;

  v_prep_overlap := coalesce(v_pay_conf, false) = true
    and lower(trim(coalesce(v_sub_stat, ''))) = 'active'
    and v_cau is not null
    and v_cau > v_now;

  perform public.activate_company_subscription(
    v_company_id,
    v_plan,
    v_cycle,
    'mpesa_stk',
    'mpesa_stk',
    v_prep_overlap
  );

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
    lower(btrim(v_company_id::text)),
    v_plan,
    coalesce(v_payment.amount, 0),
    'approved',
    'mpesa_stk',
    'mpesa_stk',
    v_receipt,
    v_cycle,
    'Auto activated via STK',
    'KES',
    v_now,
    v_now,
    v_now,
    v_now,
    'mpesa_stk'
  )
  returning id into v_new_payment_id;

  perform public.apply_excess_for_subscription_payment(v_new_payment_id, v_prep_overlap);

  update public.mpesa_payments
  set subscription_activated = true
  where checkout_request_id = btrim(_checkout_request_id);

  return v_new_payment_id;
end;
$$;

revoke all on function public.activate_subscription_from_mpesa_stk(text) from public;
grant execute on function public.activate_subscription_from_mpesa_stk(text) to service_role;

-- ---------------------------------------------------------------------------
-- Manual approve — commission handled in Edge only
-- ---------------------------------------------------------------------------
create or replace function public.approve_subscription_payment(_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = admin, core, public
as $$
declare
  v_company_id_text text;
  v_company_id       uuid;
  v_plan             text;
  v_cycle            text;
  v_reviewer         text;
  v_now              timestamptz := clock_timestamp();
  v_amount           numeric;
  v_cau              timestamptz;
  v_sub_stat         text;
  v_pay_conf         boolean;
  v_prep_overlap     boolean;
begin
  if not admin.is_developer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  v_reviewer := core.current_user_id();

  update public.subscription_payments sp
  set
    status      = 'approved'::public.subscription_payment_status,
    approved_at = v_now,
    approved_by = v_reviewer,
    reviewed_at = v_now,
    reviewed_by = v_reviewer,
    rejected_at = null
  where sp.id = _payment_id
    and sp.status in (
      'pending'::public.subscription_payment_status,
      'pending_verification'::public.subscription_payment_status
    )
  returning sp.company_id, sp.plan_id, sp.billing_cycle, sp.amount
  into v_company_id_text, v_plan, v_cycle, v_amount;

  if v_company_id_text is null then
    raise exception 'Payment not found or not pending' using errcode = 'P0001';
  end if;

  begin
    v_company_id := trim(v_company_id_text)::uuid;
  exception
    when invalid_text_representation then
      raise exception 'Invalid company_id on payment row' using errcode = 'P0001';
  end;

  v_plan := lower(trim(coalesce(v_plan, 'basic')));
  if v_plan not in ('basic', 'pro') then
    v_plan := case when v_plan like '%pro%' then 'pro' else 'basic' end;
  end if;

  v_cycle := lower(trim(coalesce(v_cycle, 'monthly')));
  if v_cycle not in ('monthly', 'seasonal', 'annual') then
    v_cycle := 'monthly';
  end if;

  select c.active_until, c.subscription_status::text, coalesce(c.payment_confirmed, false)
  into v_cau, v_sub_stat, v_pay_conf
  from core.companies c
  where c.id = v_company_id;

  v_prep_overlap := coalesce(v_pay_conf, false) = true
    and lower(trim(coalesce(v_sub_stat, ''))) = 'active'
    and v_cau is not null
    and v_cau > v_now;

  perform public.activate_company_subscription(
    v_company_id, v_plan, v_cycle, 'manual', v_reviewer, v_prep_overlap
  );

  update public.subscription_payments sp
  set company_id = lower(btrim(sp.company_id))
  where sp.id = _payment_id;

  perform public.apply_excess_for_subscription_payment(_payment_id, v_prep_overlap);
end;
$$;

grant execute on function public.approve_subscription_payment(uuid) to authenticated;

commit;

notify pgrst, 'reload schema';
