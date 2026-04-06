-- FarmVault ambassador commissions (flat KES):
--   Referral company signup: KES 200 (signup_bonus) — one per referred company
--   First subscription payment: KES 600; each later successful payment: KES 400
-- Idempotency: public.ambassador_transactions unique (company_id, receipt_number)
-- Core API: public.award_subscription_commission(company_id, receipt_number)

begin;

-- ---------------------------------------------------------------------------
-- 1) Welcome bonus: rename type so per-company signup_bonus can exist
-- ---------------------------------------------------------------------------
update public.ambassador_earnings e
set type = 'ambassador_welcome_bonus'
where e.type = 'signup_bonus'
  and coalesce(e.description, '') = 'Welcome bonus';

drop index if exists public.ux_ambassador_earnings_signup_bonus;

create unique index if not exists ux_ambassador_earnings_welcome_bonus
  on public.ambassador_earnings (ambassador_id)
  where type = 'ambassador_welcome_bonus';

insert into public.ambassador_earnings (ambassador_id, amount, type, status, description)
select a.id, 200, 'ambassador_welcome_bonus', 'owed', 'Welcome bonus'
from public.ambassadors a
where not exists (
  select 1
  from public.ambassador_earnings e2
  where e2.ambassador_id = a.id
    and e2.type = 'ambassador_welcome_bonus'
);

-- ---------------------------------------------------------------------------
-- 2) Referrals: first paid subscription flag
-- ---------------------------------------------------------------------------
alter table public.referrals
  add column if not exists first_subscription_paid boolean not null default false;

update public.referrals r
set first_subscription_paid = true
where exists (
  select 1
  from public.ambassador_earnings e
  where e.referral_id = r.id
    and e.type = 'farmer_subscription_commission'
);

comment on column public.referrals.first_subscription_paid is
  'True after the first successful workspace subscription commission for this referral (flat KES program or legacy farmer_subscription_commission).';

-- ---------------------------------------------------------------------------
-- 3) ambassador_transactions + link from ambassador_earnings
-- ---------------------------------------------------------------------------
create table if not exists public.ambassador_transactions (
  id uuid primary key default gen_random_uuid(),
  ambassador_id uuid not null references public.ambassadors (id) on delete cascade,
  company_id uuid not null references core.companies (id) on delete cascade,
  receipt_number text not null,
  type text not null check (type in ('signup_bonus', 'subscription_commission')),
  amount numeric not null check (amount >= 0),
  status text not null check (status in ('owed', 'paid')),
  description text,
  referral_id uuid references public.referrals (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint ux_ambassador_transactions_company_receipt unique (company_id, receipt_number)
);

create index if not exists idx_ambassador_transactions_ambassador
  on public.ambassador_transactions (ambassador_id);

create index if not exists idx_ambassador_transactions_referral
  on public.ambassador_transactions (referral_id)
  where referral_id is not null;

alter table public.ambassador_earnings
  add column if not exists commission_tx_id uuid references public.ambassador_transactions (id) on delete set null;

alter table public.ambassador_transactions enable row level security;

revoke all on public.ambassador_transactions from public;
grant all on public.ambassador_transactions to service_role;

-- ---------------------------------------------------------------------------
-- 4) Sync transaction row when linked earning is marked paid
-- ---------------------------------------------------------------------------
create or replace function public.trg_ambassador_earnings_sync_commission_tx_paid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and new.status = 'paid'
     and coalesce(old.status, '') is distinct from 'paid'
     and new.commission_tx_id is not null then
    update public.ambassador_transactions t
    set status = 'paid'
    where t.id = new.commission_tx_id
      and t.status = 'owed';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ambassador_earnings_sync_commission_tx_paid on public.ambassador_earnings;
create trigger trg_ambassador_earnings_sync_commission_tx_paid
after update of status on public.ambassador_earnings
for each row
execute procedure public.trg_ambassador_earnings_sync_commission_tx_paid();

-- ---------------------------------------------------------------------------
-- 5) Referral → commissioned when subscription commission paid out
-- ---------------------------------------------------------------------------
create or replace function public.trg_ambassador_earnings_referral_commissioned()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and new.status = 'paid'
     and coalesce(old.status, '') is distinct from 'paid'
     and new.referral_id is not null
     and new.type in ('farmer_subscription_commission', 'subscription_commission') then
    update public.referrals r
    set
      referral_status = 'commissioned',
      commissioned_at = coalesce(r.commissioned_at, now()),
      last_activity_at = now()
    where r.id = new.referral_id;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6) award_subscription_commission — idempotent per (company_id, receipt_number)
-- ---------------------------------------------------------------------------
create or replace function public.award_subscription_commission(
  p_company_id uuid,
  p_receipt_number text
)
returns jsonb
language plpgsql
security definer
set search_path = public, core
as $$
declare
  v_amb uuid;
  v_ref uuid;
  v_receipt text;
  v_first boolean;
  v_comm numeric;
  v_tx_id uuid;
begin
  if p_company_id is null then
    return jsonb_build_object('ok', false, 'error', 'missing_company');
  end if;

  v_receipt := nullif(trim(coalesce(p_receipt_number, '')), '');
  if v_receipt is null then
    return jsonb_build_object('ok', false, 'error', 'missing_receipt');
  end if;

  select c.referred_by_ambassador_id
  into v_amb
  from core.companies c
  where c.id = p_company_id;

  if v_amb is null then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'no_ambassador');
  end if;

  select r.id, coalesce(r.first_subscription_paid, false)
  into v_ref, v_first
  from public.referrals r
  where r.referrer_id = v_amb
    and r.referred_user_type = 'company'
    and r.referred_user_id = p_company_id
  order by r.created_at asc
  limit 1;

  if v_ref is null then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'no_referral');
  end if;

  insert into public.ambassador_transactions (
    ambassador_id,
    company_id,
    receipt_number,
    type,
    amount,
    status,
    description,
    referral_id
  )
  values (
    v_amb,
    p_company_id,
    v_receipt,
    'subscription_commission',
    case when not v_first then 600 else 400 end,
    'owed',
    'Farmer workspace subscription',
    v_ref
  )
  on conflict (company_id, receipt_number) do nothing
  returning id into v_tx_id;

  if v_tx_id is null then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'duplicate_receipt');
  end if;

  v_comm := case when not v_first then 600 else 400 end;

  insert into public.ambassador_earnings (
    ambassador_id,
    amount,
    type,
    status,
    description,
    referral_id,
    commission_tx_id
  )
  values (
    v_amb,
    v_comm,
    'subscription_commission',
    'owed',
    'Farmer workspace subscription',
    v_ref,
    v_tx_id
  );

  update public.referrals r
  set
    first_subscription_paid = case when not v_first then true else r.first_subscription_paid end,
    referral_status = case
      when r.referral_status = 'commissioned' then r.referral_status
      else 'subscribed'
    end,
    subscribed_at = coalesce(r.subscribed_at, now()),
    last_activity_at = now(),
    is_active = true
  where r.id = v_ref;

  return jsonb_build_object(
    'ok', true,
    'amount', v_comm,
    'first_subscription_payment', not v_first
  );
end;
$$;

revoke all on function public.award_subscription_commission(uuid, text) from public;
grant execute on function public.award_subscription_commission(uuid, text) to service_role;

comment on function public.award_subscription_commission(uuid, text) is
  'Flat KES ambassador commission for a subscription payment. Idempotent on (company_id, receipt_number).';

-- ---------------------------------------------------------------------------
-- 7) Legacy wrapper — new signature (receipt required)
-- ---------------------------------------------------------------------------
drop function if exists public.apply_farmer_referral_subscription_commission(uuid, numeric, text);

create or replace function public.apply_farmer_referral_subscription_commission(
  p_company_id uuid,
  p_receipt_number text,
  p_payment_amount numeric default null,
  p_source text default null
)
returns void
language plpgsql
security definer
set search_path = public, core
as $$
begin
  perform public.award_subscription_commission(p_company_id, p_receipt_number);
end;
$$;

revoke all on function public.apply_farmer_referral_subscription_commission(uuid, text, numeric, text) from public;
grant execute on function public.apply_farmer_referral_subscription_commission(uuid, text, numeric, text) to service_role;

-- ---------------------------------------------------------------------------
-- 8) Company signup via ambassador — KES 200 to referrer
-- ---------------------------------------------------------------------------
create or replace function public.apply_ambassador_referral_company_signup_bonus(
  p_ambassador_id uuid,
  p_company_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, core
as $$
declare
  v_ref uuid;
  v_tx_id uuid;
begin
  if p_ambassador_id is null or p_company_id is null then
    return;
  end if;

  select r.id
  into v_ref
  from public.referrals r
  where r.referrer_id = p_ambassador_id
    and r.referred_user_type = 'company'
    and r.referred_user_id = p_company_id
  order by r.created_at asc
  limit 1;

  if v_ref is null then
    return;
  end if;

  insert into public.ambassador_transactions (
    ambassador_id,
    company_id,
    receipt_number,
    type,
    amount,
    status,
    description,
    referral_id
  )
  values (
    p_ambassador_id,
    p_company_id,
    'signup_bonus',
    'signup_bonus',
    200,
    'owed',
    'Referred company signup',
    v_ref
  )
  on conflict (company_id, receipt_number) do nothing
  returning id into v_tx_id;

  if v_tx_id is null then
    return;
  end if;

  insert into public.ambassador_earnings (
    ambassador_id,
    amount,
    type,
    status,
    description,
    referral_id,
    commission_tx_id
  )
  values (
    p_ambassador_id,
    200,
    'signup_bonus',
    'owed',
    'Referred company signup',
    v_ref,
    v_tx_id
  );
end;
$$;

revoke all on function public.apply_ambassador_referral_company_signup_bonus(uuid, uuid) from public;
grant execute on function public.apply_ambassador_referral_company_signup_bonus(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9) apply_farmer_referral_attribution — award signup bonus when bound
-- ---------------------------------------------------------------------------
create or replace function public.apply_farmer_referral_attribution(
  p_company_id uuid,
  p_clerk_user_id text,
  p_referral_code text default null,
  p_device_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, core
as $$
declare
  v_code text;
  v_amb uuid;
  v_existing uuid;
begin
  if p_company_id is null or p_clerk_user_id is null or length(trim(p_clerk_user_id)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_args');
  end if;

  select c.referred_by_ambassador_id
  into v_existing
  from core.companies c
  where c.id = p_company_id
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'company_not_found');
  end if;

  if v_existing is not null then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'already_bound');
  end if;

  v_code := nullif(upper(trim(coalesce(p_referral_code, ''))), '');

  if v_code is null and p_device_id is not null and length(trim(p_device_id)) > 0 then
    select rs.referral_code
    into v_code
    from public.referral_sessions rs
    where rs.device_id = trim(p_device_id)
      and rs.consumed = false
    order by rs.created_at desc
    limit 1;
  end if;

  if v_code is null then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'no_code');
  end if;

  v_amb := public.get_ambassador_id_by_referral_code(v_code);
  if v_amb is null then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'invalid_code');
  end if;

  if exists (
    select 1
    from public.ambassadors a
    where a.id = v_amb
      and a.clerk_user_id is not null
      and a.clerk_user_id = p_clerk_user_id
  ) then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'self_referral');
  end if;

  update core.companies
  set referred_by_ambassador_id = v_amb,
      updated_at = now()
  where id = p_company_id
    and referred_by_ambassador_id is null;

  insert into public.referrals (
    referrer_id,
    referred_user_id,
    referred_user_type,
    level,
    is_active,
    referral_status,
    company_id,
    last_activity_at
  )
  values (
    v_amb,
    p_company_id,
    'company',
    1,
    true,
    'signed_up',
    p_company_id,
    now()
  )
  on conflict (referrer_id, referred_user_id) where (referred_user_type = 'company') do nothing;

  update public.referral_sessions
  set
    consumed = true,
    consumed_at = now(),
    consumed_company_id = p_company_id
  where consumed = false
    and upper(trim(referral_code)) = v_code
    and (
      (p_device_id is not null and length(trim(p_device_id)) > 0 and device_id = trim(p_device_id))
      or clerk_user_id = p_clerk_user_id
    );

  perform public.apply_ambassador_referral_company_signup_bonus(v_amb, p_company_id);

  return jsonb_build_object('ok', true, 'ambassador_id', v_amb);
end;
$$;

revoke all on function public.apply_farmer_referral_attribution(uuid, text, text, text) from public;
grant execute on function public.apply_farmer_referral_attribution(uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 10) M-Pesa STK activation + manual approve — pass stable receipt keys
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
  v_comm_receipt     text;
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

    v_company_id := v_payment.company_id::uuid;

    select sp.id, sp.transaction_code
    into v_new_payment_id, v_receipt
    from public.subscription_payments sp
    where lower(btrim(sp.company_id)) = lower(btrim(v_payment.company_id::text))
      and sp.billing_mode = 'mpesa_stk'
      and (
        transaction_code = nullif(trim(coalesce(v_payment.mpesa_receipt, '')), '')
        or notes like '%' || coalesce(v_payment.mpesa_receipt, '') || '%'
      )
    order by sp.created_at desc
    limit 1;

    v_comm_receipt := coalesce(
      nullif(trim(coalesce(v_receipt, '')), ''),
      nullif(trim(coalesce(v_payment.mpesa_receipt, '')), ''),
      'stk_checkout:' || btrim(_checkout_request_id)
    );
    if v_new_payment_id is not null then
      v_comm_receipt := coalesce(
        nullif(trim(coalesce(v_receipt, '')), ''),
        'subscription_payment:' || v_new_payment_id::text
      );
    end if;

    perform public.apply_farmer_referral_subscription_commission(v_company_id, v_comm_receipt);
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

  v_comm_receipt := coalesce(
    v_receipt,
    'subscription_payment:' || v_new_payment_id::text
  );
  perform public.apply_farmer_referral_subscription_commission(v_company_id, v_comm_receipt);

  return v_new_payment_id;
end;
$$;

revoke all on function public.activate_subscription_from_mpesa_stk(text) from public;
grant execute on function public.activate_subscription_from_mpesa_stk(text) to service_role;

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
  v_txn              text;
  v_comm_receipt     text;
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
  returning sp.company_id, sp.plan_id, sp.billing_cycle, sp.amount, sp.transaction_code
  into v_company_id_text, v_plan, v_cycle, v_amount, v_txn;

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

  v_comm_receipt := coalesce(
    nullif(trim(coalesce(v_txn, '')), ''),
    'subscription_payment:' || _payment_id::text
  );
  perform public.apply_farmer_referral_subscription_commission(v_company_id, v_comm_receipt);
end;
$$;

grant execute on function public.approve_subscription_payment(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 11) Ambassador welcome bonus inserts (type rename)
-- ---------------------------------------------------------------------------
create or replace function public.register_ambassador_for_clerk(
  p_name          text,
  p_phone         text,
  p_email         text,
  p_type          text,
  p_referrer_code text default null,
  p_device_id     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, core
as $$
declare
  v_clerk    text;
  v_existing record;
  v_parent   uuid;
  v_id       uuid;
  v_code     text;
  v_src      text;
begin
  v_clerk := nullif(trim(coalesce(core.current_user_id(), '')), '');
  if v_clerk is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select a.id, a.referral_code
  into v_existing
  from public.ambassadors a
  where a.clerk_user_id = v_clerk
  limit 1;

  if found then
    return jsonb_build_object(
      'ok', true,
      'id', v_existing.id,
      'referral_code', v_existing.referral_code,
      'already_registered', true
    );
  end if;

  if p_type is null or p_type not in ('agrovet', 'farmer', 'company') then
    return jsonb_build_object('ok', false, 'error', 'invalid_type');
  end if;

  if p_name is null or length(trim(p_name)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'name_required');
  end if;

  v_src := nullif(upper(trim(coalesce(p_referrer_code, ''))), '');
  if v_src is null and p_device_id is not null and length(trim(p_device_id)) > 0 then
    select rs.referral_code
    into v_src
    from public.referral_sessions rs
    where rs.device_id = trim(p_device_id)
      and rs.consumed = false
    order by rs.created_at desc
    limit 1;
  end if;

  v_parent := null;
  if v_src is not null then
    v_parent := public.get_ambassador_id_by_referral_code(v_src);
  end if;

  insert into public.ambassadors (
    name,
    phone,
    email,
    type,
    clerk_user_id,
    referred_by,
    onboarding_complete
  )
  values (
    trim(p_name),
    nullif(trim(p_phone), ''),
    nullif(trim(p_email), ''),
    p_type,
    v_clerk,
    v_parent,
    false
  )
  returning id, referral_code into v_id, v_code;

  insert into public.ambassador_earnings (ambassador_id, amount, type, status, description)
  values (v_id, 200, 'ambassador_welcome_bonus', 'owed', 'Welcome bonus')
  on conflict (ambassador_id) where (type = 'ambassador_welcome_bonus') do nothing;

  if v_src is not null and p_device_id is not null and length(trim(p_device_id)) > 0 then
    update public.referral_sessions
    set consumed = true,
        consumed_at = now()
    where consumed = false
      and upper(trim(referral_code)) = v_src
      and device_id = trim(p_device_id);
  end if;

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'referral_code', v_code,
    'already_registered', false
  );
exception
  when unique_violation then
    select a.id, a.referral_code into v_id, v_code
    from public.ambassadors a
    where a.clerk_user_id = v_clerk
    limit 1;
    if found then
      return jsonb_build_object(
        'ok', true,
        'id', v_id,
        'referral_code', v_code,
        'already_registered', true
      );
    end if;
    return jsonb_build_object('ok', false, 'error', 'conflict');
end;
$$;

revoke all on function public.register_ambassador_for_clerk(text, text, text, text, text, text) from public;
grant execute on function public.register_ambassador_for_clerk(text, text, text, text, text, text) to authenticated;

create or replace function public.complete_ambassador_onboarding(p_ambassador_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.ambassadors
  set onboarding_complete = true
  where id = p_ambassador_id;

  insert into public.ambassador_earnings (ambassador_id, amount, type, status, description)
  values (p_ambassador_id, 200, 'ambassador_welcome_bonus', 'owed', 'Welcome bonus')
  on conflict (ambassador_id) where (type = 'ambassador_welcome_bonus') do nothing;
end;
$$;

revoke all on function public.complete_ambassador_onboarding(uuid) from public;
grant execute on function public.complete_ambassador_onboarding(uuid) to anon, authenticated;

create or replace function public.complete_my_ambassador_onboarding()
returns jsonb
language plpgsql
security definer
set search_path = public, core
as $$
declare
  v_clerk       text;
  v_id          uuid;
  n             int;
  v_has_company boolean;
  v_done        boolean;
begin
  v_clerk := nullif(trim(coalesce(core.current_user_id(), '')), '');
  if v_clerk is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select a.id, coalesce(a.onboarding_complete, false)
  into v_id, v_done
  from public.ambassadors a
  where a.clerk_user_id = v_clerk
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_done then
    return jsonb_build_object('ok', true, 'already_complete', true);
  end if;

  update public.ambassadors
  set onboarding_complete = true
  where id = v_id;

  get diagnostics n = row_count;
  if n = 0 then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  insert into public.ambassador_earnings (ambassador_id, amount, type, status, description)
  values (v_id, 200, 'ambassador_welcome_bonus', 'owed', 'Welcome bonus')
  on conflict (ambassador_id) where (type = 'ambassador_welcome_bonus') do nothing;

  select exists(
    select 1 from core.company_members m
    where m.clerk_user_id = v_clerk
  ) into v_has_company;

  update core.profiles
  set user_type  = case when v_has_company then 'both' else 'ambassador' end,
      updated_at = now()
  where clerk_user_id = v_clerk;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.complete_my_ambassador_onboarding() from public;
grant execute on function public.complete_my_ambassador_onboarding() to authenticated;

-- ---------------------------------------------------------------------------
-- 12) Referral rows UI — include subscription_commission
-- ---------------------------------------------------------------------------
create or replace function public.fetch_ambassador_referral_rows(p_ambassador_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, core
stable
as $$
begin
  if p_ambassador_id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  if not exists (select 1 from public.ambassadors a where a.id = p_ambassador_id) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  return jsonb_build_object(
    'ok', true,
    'rows', coalesce((
      select jsonb_agg(row_obj order by sort_at desc)
      from (
        select
          r.created_at as sort_at,
          jsonb_build_object(
            'referral_id', r.id,
            'name', coalesce(
              nullif(trim(amb.name), ''),
              nullif(trim(comp.name), ''),
              initcap(r.referred_user_type::text)
            ),
            'type', r.referred_user_type,
            'status', case when coalesce(r.is_active, true) then 'active' else 'inactive' end,
            'referral_status', coalesce(r.referral_status, 'signed_up'),
            'date', r.created_at,
            'last_activity_at', r.last_activity_at,
            'subscription_status', case
              when r.referred_user_type = 'company' then
                case
                  when coalesce(sub.is_trial, false) and coalesce(sub.status::text, '') = 'active' then 'trial'
                  when coalesce(sub.status::text, '') = 'active' then 'paid'
                  else coalesce(sub.status::text, 'none')
                end
              else null
            end,
            'commission_status', case
              when r.referral_status = 'commissioned' then 'paid'
              when exists (
                select 1 from public.ambassador_earnings e
                where e.referral_id = r.id
                  and e.type in ('farmer_subscription_commission', 'subscription_commission')
                  and e.status = 'paid'
              ) then 'paid'
              when exists (
                select 1 from public.ambassador_earnings e
                where e.referral_id = r.id
                  and e.type in ('farmer_subscription_commission', 'subscription_commission')
                  and e.status = 'owed'
              ) then 'owed'
              else 'none'
            end,
            'commission', coalesce((
              select sum(c.amount)::numeric
              from public.commissions c
              where c.referrer_id = p_ambassador_id
                and c.user_id is not distinct from r.referred_user_id
            ), 0) + coalesce((
              select sum(e.amount)::numeric
              from public.ambassador_earnings e
              where e.ambassador_id = p_ambassador_id
                and e.referral_id = r.id
            ), 0)
          ) as row_obj
        from public.referrals r
        left join public.ambassadors amb
          on r.referred_user_type = 'ambassador' and amb.id = r.referred_user_id
        left join core.companies comp
          on r.referred_user_type = 'company' and comp.id = r.referred_user_id
        left join public.company_subscriptions sub
          on r.referred_user_type = 'company' and sub.company_id = r.referred_user_id
        where r.referrer_id = p_ambassador_id
      ) sub
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.fetch_ambassador_referral_rows(uuid) from public;
grant execute on function public.fetch_ambassador_referral_rows(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 13) Backfill: one first subscription commission (600) per referred company
--     when they are paid/active, had no legacy % commission, and have no
--     subscription_commission rows yet. Renewals continue to use live payment paths.
-- ---------------------------------------------------------------------------
do $bf$
declare
  rec record;
begin
  for rec in
    select distinct on (c.id)
      c.id as cid,
      coalesce(
        nullif(trim(coalesce(sp.transaction_code, '')), ''),
        'subscription_payment:' || sp.id::text
      ) as rcp
    from public.subscription_payments sp
    inner join core.companies c
      on lower(btrim(c.id::text)) = lower(btrim(sp.company_id))
    inner join public.referrals r
      on r.referred_user_id = c.id
     and r.referred_user_type = 'company'
    inner join public.company_subscriptions sub
      on sub.company_id = c.id
    where sp.status = 'approved'::public.subscription_payment_status
      and sub.status = 'active'
      and coalesce(sub.is_trial, false) = false
      and not exists (
        select 1
        from public.ambassador_transactions t
        where t.company_id = c.id
          and t.type = 'subscription_commission'
      )
      and not exists (
        select 1
        from public.ambassador_earnings e
        where e.referral_id = r.id
          and e.type = 'farmer_subscription_commission'
      )
    order by c.id, coalesce(sp.approved_at, sp.created_at), sp.created_at
  loop
    perform public.award_subscription_commission(rec.cid, rec.rcp);
  end loop;
end;
$bf$;

commit;

notify pgrst, 'reload schema';
