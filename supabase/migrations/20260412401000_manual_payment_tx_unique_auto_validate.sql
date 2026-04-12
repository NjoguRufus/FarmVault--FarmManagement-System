-- Manual M-Pesa fallback: unique normalized transaction codes (non-rejected rows),
-- optional auto-approval when submitted code matches a successful STK row for the same company,
-- and safe internal helpers so tenant-triggered finalize does not rely on service_role JWT.
--
-- STK primary flow: unchanged (still uses public.activate_company_subscription / apply_excess wrappers).
-- Backward compatible: status enum remains pending | approved | rejected | pending_verification.

begin;

-- ---------------------------------------------------------------------------
-- Normalization helpers (immutable; safe for indexes)
-- ---------------------------------------------------------------------------
create or replace function public.normalize_subscription_mpesa_tx_code(_raw text)
returns text
language sql
immutable
as $$
  select upper(
    left(
      regexp_replace(trim(coalesce(_raw, '')), '[^A-Za-z0-9]', '', 'g'),
      10
    )
  );
$$;

comment on function public.normalize_subscription_mpesa_tx_code(text) is
  'Normalize M-Pesa receipt / manual transaction code for uniqueness and STK matching (upper, strip non-alnum, max 10).';

create or replace function public.normalize_phone_digits_for_billing(_raw text)
returns text
language sql
immutable
as $$
  select case
    when _raw is null or length(trim(_raw)) = 0 then null::text
    else regexp_replace(trim(_raw), '[^0-9]', '', 'g')
  end;
$$;

comment on function public.normalize_phone_digits_for_billing(text) is
  'Digits-only phone for loose matching between manual submit and mpesa_payments.phone.';

-- ---------------------------------------------------------------------------
-- Legacy duplicate cleanup (required before partial unique index)
-- Keeps one row per normalized tx (prefer approved > pending_verification > pending); rewrites others.
-- ---------------------------------------------------------------------------
with ranked as (
  select
    sp.id,
    public.normalize_subscription_mpesa_tx_code(sp.transaction_code) as ntx,
    sp.status::text as st,
    sp.created_at,
    row_number() over (
      partition by public.normalize_subscription_mpesa_tx_code(sp.transaction_code)
      order by
        case sp.status::text
          when 'approved' then 1
          when 'pending_verification' then 2
          when 'pending' then 3
          else 9
        end,
        sp.created_at desc nulls last
    ) as rn
  from public.subscription_payments sp
  where sp.transaction_code is not null
    and btrim(sp.transaction_code) <> ''
    and length(public.normalize_subscription_mpesa_tx_code(sp.transaction_code)) >= 8
    and sp.status::text <> 'rejected'
),
dups as (
  select id, ntx from ranked where rn > 1
)
update public.subscription_payments sp
set
  transaction_code = upper(substring(md5(sp.id::text || coalesce(d.ntx, '')) from 1 for 10)),
  notes = left(
    coalesce(sp.notes, '') || E'\n[legacy duplicate tx deduped 20260412401000; prior_norm=' || coalesce(d.ntx, '') || ']',
    2000
  )
from dups d
where sp.id = d.id;

create unique index if not exists subscription_payments_tx_norm_active_uidx
  on public.subscription_payments (public.normalize_subscription_mpesa_tx_code(transaction_code))
  where transaction_code is not null
    and btrim(transaction_code) <> ''
    and length(public.normalize_subscription_mpesa_tx_code(transaction_code)) >= 8
    and status <> 'rejected'::public.subscription_payment_status;

comment on index public.subscription_payments_tx_norm_active_uidx is
  'One active (non-rejected) subscription_payment per normalized M-Pesa code; NULL / short codes ignored.';

create index if not exists idx_subscription_payments_status
  on public.subscription_payments (status);

create index if not exists idx_subscription_payments_company
  on public.subscription_payments (company_id);

-- ---------------------------------------------------------------------------
-- Internal: apply_excess (no JWT gate — only callable from trusted definer SQL)
-- ---------------------------------------------------------------------------
create or replace function public._apply_excess_for_subscription_payment_internal(
  _payment_id uuid,
  _prep_overlap boolean default false
)
returns void
language plpgsql
security definer
set search_path = admin, core, public
as $$
declare
  v_now              timestamptz := clock_timestamp();
  v_pay_plan         text;
  v_pay_cycle        text;
  v_amount           numeric;
  v_company_id_txt   text;
  v_company_id       uuid;
  v_pay_plan_price   numeric;
  v_excess_add       numeric;
  v_consume_plan     text;
  v_consume_cycle    text;
  v_consume_price    numeric;
  v_int              interval;
  v_bal              numeric;
  v_cau              timestamptz;
  v_has_sub          boolean;
begin
  select
    sp.company_id,
    sp.plan_id,
    sp.billing_cycle,
    sp.amount
  into v_company_id_txt, v_pay_plan, v_pay_cycle, v_amount
  from public.subscription_payments sp
  where sp.id = _payment_id
    and sp.status = 'approved'::public.subscription_payment_status;

  if v_company_id_txt is null then
    raise exception 'Approved payment not found' using errcode = 'P0001';
  end if;

  begin
    v_company_id := trim(v_company_id_txt)::uuid;
  exception
    when invalid_text_representation then
      raise exception 'Invalid company_id on payment' using errcode = 'P0001';
  end;

  v_pay_plan := lower(trim(coalesce(v_pay_plan, 'basic')));
  if v_pay_plan not in ('basic', 'pro') then
    v_pay_plan := case when v_pay_plan like '%pro%' then 'pro' else 'basic' end;
  end if;

  v_pay_cycle := lower(trim(coalesce(v_pay_cycle, 'monthly')));
  if v_pay_cycle not in ('monthly', 'seasonal', 'annual') then
    v_pay_cycle := 'monthly';
  end if;

  v_pay_plan_price := public.billing_plan_price_kes(v_pay_plan, v_pay_cycle);

  if coalesce(_prep_overlap, false) then
    v_excess_add := coalesce(v_amount, 0);
  elsif v_pay_plan_price is null or v_pay_plan_price <= 0 then
    v_excess_add := 0;
  else
    v_excess_add := greatest(0::numeric, coalesce(v_amount, 0) - v_pay_plan_price);
  end if;

  update core.companies c
  set
    excess_balance = coalesce(c.excess_balance, 0) + coalesce(v_excess_add, 0),
    updated_at     = v_now
  where c.id = v_company_id;

  select exists (
    select 1
    from public.company_subscriptions cs
    where cs.company_id::text = v_company_id::text
  )
  into v_has_sub;

  if v_has_sub is true then
    select
      lower(trim(coalesce(nullif(trim(cs.plan_code::text), ''), nullif(trim(cs.plan_id::text), ''), 'basic'))),
      lower(trim(coalesce(nullif(trim(cs.billing_cycle::text), ''), 'monthly')))
    into v_consume_plan, v_consume_cycle
    from public.company_subscriptions cs
    where cs.company_id::text = v_company_id::text
    limit 1;
  else
    v_consume_plan := v_pay_plan;
    v_consume_cycle := v_pay_cycle;
  end if;

  if v_consume_plan not in ('basic', 'pro') then
    v_consume_plan := case when v_consume_plan like '%pro%' then 'pro' else 'basic' end;
  end if;

  if v_consume_cycle not in ('monthly', 'seasonal', 'annual') then
    v_consume_cycle := 'monthly';
  end if;

  v_consume_price := public.billing_plan_price_kes(v_consume_plan, v_consume_cycle);

  if v_consume_price is null or v_consume_price <= 0 then
    return;
  end if;

  if v_consume_cycle = 'seasonal' then
    v_int := interval '3 months';
  elsif v_consume_cycle = 'annual' then
    v_int := interval '1 year';
  else
    v_int := interval '1 month';
  end if;

  loop
    select coalesce(c.excess_balance, 0)
    into v_bal
    from core.companies c
    where c.id = v_company_id
    for update;

    exit when v_bal < v_consume_price;

    select c.active_until
    into v_cau
    from core.companies c
    where c.id = v_company_id;

    update core.companies c
    set
      active_until = greatest(coalesce(v_cau, v_now), v_now) + v_int,
      excess_balance = coalesce(c.excess_balance, 0) - v_consume_price,
      updated_at = v_now
    where c.id = v_company_id;

    update public.company_subscriptions s
    set
      current_period_end = c.active_until,
      active_until = c.active_until,
      updated_at = v_now
    from core.companies c
    where s.company_id::text = c.id::text
      and c.id = v_company_id;
  end loop;
end;
$$;

revoke all on function public._apply_excess_for_subscription_payment_internal(uuid, boolean) from public;

-- Wrapper: same signature + grants as before
create or replace function public.apply_excess_for_subscription_payment(
  _payment_id uuid,
  _prep_overlap boolean default false
)
returns void
language plpgsql
security definer
set search_path = admin, core, public
as $$
begin
  if coalesce(auth.role()::text, '') is distinct from 'service_role' and not admin.is_developer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  perform public._apply_excess_for_subscription_payment_internal(_payment_id, _prep_overlap);
end;
$$;

revoke all on function public.apply_excess_for_subscription_payment(uuid, boolean) from public;
grant execute on function public.apply_excess_for_subscription_payment(uuid, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Internal: activate_company_subscription body (no JWT gate)
-- ---------------------------------------------------------------------------
create or replace function public._activate_company_subscription_internal(
  p_company_id   uuid,
  p_plan         text,
  p_cycle        text,
  p_billing_mode text default 'mpesa_stk',
  p_actor        text default null,
  p_prepay_wallet_only boolean default false
)
returns void
language plpgsql
security definer
set search_path = admin, core, public
as $$
declare
  v_plan         text;
  v_cycle        text;
  v_active_until timestamptz;
  v_now          timestamptz := clock_timestamp();
  v_mode         text := lower(trim(coalesce(p_billing_mode, 'mpesa_stk')));
  v_actor        text := nullif(trim(coalesce(p_actor, '')), '');
  v_cau          timestamptz;
  v_sub_stat     text;
  v_pay_conf     boolean;
  v_anchor       timestamptz;
  v_int          interval;
  v_prepay_only  boolean := coalesce(p_prepay_wallet_only, false);
  v_overlap      boolean;
begin
  if p_company_id is null then
    raise exception 'company_id required' using errcode = 'P0001';
  end if;

  if v_actor is null then
    v_actor := 'system';
  end if;

  v_plan := lower(trim(coalesce(p_plan, 'basic')));
  if v_plan not in ('basic', 'pro') then
    v_plan := case when v_plan like '%pro%' then 'pro' else 'basic' end;
  end if;

  v_cycle := lower(trim(coalesce(p_cycle, 'monthly')));
  if v_cycle = 'seasonal' then
    v_int := interval '3 months';
  elsif v_cycle = 'annual' then
    v_int := interval '1 year';
  else
    v_cycle := 'monthly';
    v_int := interval '1 month';
  end if;

  select c.active_until, c.subscription_status::text, coalesce(c.payment_confirmed, false)
  into v_cau, v_sub_stat, v_pay_conf
  from core.companies c
  where c.id = p_company_id;

  v_overlap := coalesce(v_pay_conf, false) = true
    and lower(trim(coalesce(v_sub_stat, ''))) = 'active'
    and v_cau is not null
    and v_cau > v_now;

  v_anchor := v_now;
  if v_overlap then
    v_anchor := v_cau;
  end if;

  if v_prepay_only and v_overlap then
    v_active_until := v_cau;
  else
    v_active_until := v_anchor + v_int;
  end if;

  insert into public.company_subscriptions (
    company_id, plan_id, plan_code, plan, status,
    billing_mode, billing_cycle,
    is_trial, trial_started_at, trial_starts_at, trial_ends_at,
    current_period_start, current_period_end, active_until,
    approved_at, approved_by, updated_at, updated_by
  )
  values (
    p_company_id, v_plan, v_plan, v_plan, 'active',
    v_mode, v_cycle,
    false, null, null, null,
    v_now, v_active_until, v_active_until,
    v_now, v_actor, v_now, v_actor
  )
  on conflict (company_id) do update set
    plan_id              = excluded.plan_id,
    plan_code            = excluded.plan_code,
    plan                 = excluded.plan,
    status               = 'active',
    billing_mode         = excluded.billing_mode,
    billing_cycle        = excluded.billing_cycle,
    is_trial             = false,
    trial_started_at     = null,
    trial_starts_at      = null,
    trial_ends_at        = null,
    current_period_start = excluded.current_period_start,
    current_period_end   = excluded.current_period_end,
    active_until         = excluded.active_until,
    approved_at          = excluded.approved_at,
    approved_by          = excluded.approved_by,
    updated_at           = excluded.updated_at,
    updated_by           = excluded.updated_by;

  update core.companies
  set
    plan                 = v_plan,
    access_level         = v_plan,
    subscription_status  = 'active',
    payment_confirmed    = true,
    pending_confirmation = false,
    active_until         = v_active_until,
    trial_ends_at        = null,
    trial_started_at     = null,
    updated_at           = v_now
  where id = p_company_id;
end;
$$;

revoke all on function public._activate_company_subscription_internal(uuid, text, text, text, text, boolean) from public;

create or replace function public.activate_company_subscription(
  p_company_id   uuid,
  p_plan         text,
  p_cycle        text,
  p_billing_mode text default 'mpesa_stk',
  p_actor        text default null,
  p_prepay_wallet_only boolean default false
)
returns void
language plpgsql
security definer
set search_path = admin, core, public
as $$
begin
  if coalesce(auth.role()::text, '') is distinct from 'service_role' and not admin.is_developer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  perform public._activate_company_subscription_internal(
    p_company_id,
    p_plan,
    p_cycle,
    p_billing_mode,
    p_actor,
    p_prepay_wallet_only
  );
end;
$$;

revoke all on function public.activate_company_subscription(uuid, text, text, text, text, boolean) from public;
grant execute on function public.activate_company_subscription(uuid, text, text, text, text, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Shared finalize: pending → approved + workspace activation + excess
-- _actor: developer id, or 'auto:mpesa_ledger|<clerk_user_id>' for auto path
-- ---------------------------------------------------------------------------
create or replace function public._subscription_payment_finalize_approval(
  _payment_id uuid,
  _actor text
)
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
  v_now              timestamptz := clock_timestamp();
  v_amount           numeric;
  v_cau              timestamptz;
  v_sub_stat         text;
  v_pay_conf         boolean;
  v_prep_overlap     boolean;
  v_actor            text := nullif(trim(coalesce(_actor, '')), '');
begin
  if v_actor is null then
    v_actor := 'system';
  end if;

  update public.subscription_payments sp
  set
    status      = 'approved'::public.subscription_payment_status,
    approved_at = v_now,
    approved_by = v_actor,
    reviewed_at = v_now,
    reviewed_by = v_actor,
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

  perform public._activate_company_subscription_internal(
    v_company_id, v_plan, v_cycle, 'manual', v_actor, v_prep_overlap
  );

  update public.subscription_payments sp
  set company_id = lower(btrim(sp.company_id))
  where sp.id = _payment_id;

  perform public._apply_excess_for_subscription_payment_internal(_payment_id, v_prep_overlap);
end;
$$;

revoke all on function public._subscription_payment_finalize_approval(uuid, text) from public;

-- ---------------------------------------------------------------------------
-- Developer approve: unchanged behavior, delegates to shared finalize
-- ---------------------------------------------------------------------------
create or replace function public.approve_subscription_payment(_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = admin, core, public
as $$
declare
  v_reviewer text;
begin
  if not admin.is_developer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  v_reviewer := core.current_user_id();
  perform public._subscription_payment_finalize_approval(_payment_id, coalesce(v_reviewer, 'developer'));
end;
$$;

grant execute on function public.approve_subscription_payment(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Developer reject: block double-approve on already-approved rows (clear message)
-- ---------------------------------------------------------------------------
create or replace function public.reject_subscription_payment(_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = admin, core, public
as $$
declare
  v_reviewer text := core.current_user_id();
  v_now timestamptz := clock_timestamp();
  v_cur public.subscription_payment_status;
begin
  if not admin.is_developer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select sp.status into v_cur
  from public.subscription_payments sp
  where sp.id = _payment_id;

  if not found then
    raise exception 'Payment not found' using errcode = 'P0001';
  end if;

  if v_cur = 'approved'::public.subscription_payment_status then
    raise exception 'Cannot reject an already approved payment' using errcode = 'P0001';
  end if;

  update public.subscription_payments sp
  set
    status = 'rejected'::public.subscription_payment_status,
    rejected_at = v_now,
    reviewed_at = v_now,
    reviewed_by = v_reviewer,
    approved_at = null,
    approved_by = null
  where sp.id = _payment_id
    and sp.status in (
      'pending'::public.subscription_payment_status,
      'pending_verification'::public.subscription_payment_status
    );

  if not found then
    raise exception 'Payment not found or not pending' using errcode = 'P0001';
  end if;
end;
$$;

grant execute on function public.reject_subscription_payment(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Manual submit: duplicate guard, insert, optional auto-approve via STK ledger match
-- ---------------------------------------------------------------------------
create or replace function public.submit_manual_subscription_payment(
  _plan_code text,
  _billing_cycle text,
  _amount numeric,
  _mpesa_name text,
  _mpesa_phone text,
  _transaction_code text,
  _currency text default 'KES',
  _notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = admin, core, public
as $$
declare
  v_company_id uuid := core.current_company_id();
  v_user text := core.current_user_id();
  v_plan text := lower(trim(coalesce(_plan_code, '')));
  v_cycle text := lower(trim(coalesce(_billing_cycle, '')));
  v_expected numeric;
  v_tx text;
  v_id uuid;
  v_member boolean := false;
  v_phone text := nullif(trim(coalesce(_mpesa_phone, '')), '');
  v_notify_email text := nullif(lower(trim(coalesce(auth.jwt() ->> 'email', ''))), '');
  v_auto boolean := false;
begin
  if v_company_id is null or v_user is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select exists (
    select 1
    from core.company_members cm
    where cm.company_id = v_company_id
      and cm.clerk_user_id = v_user
  ) into v_member;

  if not v_member then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if v_plan not in ('basic', 'pro') then
    raise exception 'invalid plan';
  end if;

  if v_cycle not in ('monthly', 'seasonal', 'annual') then
    raise exception 'invalid billing cycle';
  end if;

  v_expected := public.expected_subscription_amount_kes(v_plan, v_cycle);
  if v_expected is null or _amount is distinct from v_expected then
    raise exception 'amount does not match selected plan and billing cycle';
  end if;

  v_tx := public.normalize_subscription_mpesa_tx_code(_transaction_code);
  if length(trim(coalesce(_mpesa_name, ''))) < 2 then
    raise exception 'M-Pesa name is required';
  end if;
  if v_phone is not null and length(v_phone) < 8 then
    raise exception 'phone number is invalid';
  end if;
  if length(v_tx) < 8 then
    raise exception 'transaction code is required';
  end if;

  if exists (
    select 1
    from public.subscription_payments sp
    where public.normalize_subscription_mpesa_tx_code(sp.transaction_code) = v_tx
      and sp.status::text <> 'rejected'
  ) then
    raise exception 'This payment code has already been used.' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.subscription_payments sp
    where sp.company_id = v_company_id::text
      and sp.status = 'pending_verification'::public.subscription_payment_status
      and sp.created_at > now() - interval '30 minutes'
  ) then
    raise exception 'You already submitted a payment recently. Please wait before submitting again.';
  end if;

  begin
    insert into public.subscription_payments (
      company_id,
      plan_id,
      amount,
      status,
      billing_mode,
      billing_cycle,
      currency,
      payment_method,
      mpesa_name,
      mpesa_phone,
      transaction_code,
      notes,
      submitted_at,
      billing_notify_email
    )
    values (
      v_company_id::text,
      v_plan,
      _amount,
      'pending_verification'::public.subscription_payment_status,
      v_cycle,
      v_cycle,
      coalesce(nullif(trim(_currency), ''), 'KES'),
      'mpesa_manual',
      trim(_mpesa_name),
      v_phone,
      v_tx,
      nullif(trim(_notes), ''),
      now(),
      case
        when v_notify_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then v_notify_email
        else null
      end
    )
    returning id into v_id;
  exception
    when unique_violation then
      raise exception 'This payment code has already been used.' using errcode = 'P0001';
  end;

  update public.company_subscriptions
  set
    status = 'pending_payment',
    updated_at = now()
  where company_id::text = v_company_id::text;

  update core.companies
  set pending_confirmation = true
  where id = v_company_id;

  select exists (
    select 1
    from public.mpesa_payments mp
    where mp.company_id = v_company_id
      and coalesce(mp.result_code, -1) = 0
      and upper(trim(coalesce(mp.status, ''))) = 'SUCCESS'
      and public.normalize_subscription_mpesa_tx_code(mp.mpesa_receipt) = v_tx
      and round(coalesce(mp.amount, 0)::numeric, 2) = round(_amount::numeric, 2)
      and (
        nullif(public.normalize_phone_digits_for_billing(mp.phone), '') is null
        or nullif(public.normalize_phone_digits_for_billing(v_phone), '') is null
        or public.normalize_phone_digits_for_billing(mp.phone)
             is not distinct from public.normalize_phone_digits_for_billing(v_phone)
      )
    limit 1
  ) into v_auto;

  if v_auto then
    perform public._subscription_payment_finalize_approval(
      v_id,
      'auto:mpesa_ledger|' || coalesce(v_user, 'unknown')
    );
  end if;

  return v_id;
end;
$$;

grant execute on function public.submit_manual_subscription_payment(text, text, numeric, text, text, text, text, text) to authenticated;

commit;

notify pgrst, 'reload schema';

-- -----------------------------------------------------------------------------
-- Post-deploy validation (run in SQL editor / psql; comments only — not executed)
-- -----------------------------------------------------------------------------
-- 1) No duplicate normalized codes among non-rejected rows:
--    select public.normalize_subscription_mpesa_tx_code(transaction_code) as ntx, count(*)
--    from public.subscription_payments
--    where status::text <> 'rejected' and transaction_code is not null and length(btrim(transaction_code)) >= 8
--    group by 1 having count(*) > 1;
--
-- 2) Manual submit then re-submit same code (expect RPC error text contains "already been used"):
--    select public.submit_manual_subscription_payment('pro','monthly',5000::numeric,'Test User','0712345678','QABCDEFGHI');
--
-- 3) Find STK rows eligible for auto-match (SUCCESS, same company, receipt normalized):
--    select id, company_id, mpesa_receipt, amount, phone, status, result_code
--    from public.mpesa_payments
--    where upper(trim(coalesce(status,''))) = 'SUCCESS' and coalesce(result_code,-1) = 0
--    order by paid_at desc nulls last limit 20;
--
-- 4) After auto-approve, payment row:
--    select id, status, approved_by, transaction_code from public.subscription_payments where id = '<uuid>';
-- -----------------------------------------------------------------------------
