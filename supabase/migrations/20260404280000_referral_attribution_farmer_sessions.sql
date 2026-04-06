begin;

-- =============================================================================
-- FarmVault ambassador referral attribution (farmers / companies)
-- - Pre-signup referral_sessions
-- - Permanent company.referred_by_ambassador_id + referrals row at company create
-- - Lifecycle: signed_up → active → subscribed → commissioned
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) referral_sessions (server-side audit + recovery when client storage fails)
-- ---------------------------------------------------------------------------
create table if not exists public.referral_sessions (
  id uuid primary key default gen_random_uuid(),
  referral_code text not null,
  device_id text,
  ip_address text,
  user_agent text,
  clerk_user_id text,
  consumed boolean not null default false,
  consumed_at timestamptz,
  consumed_company_id uuid references core.companies (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_referral_sessions_code_created
  on public.referral_sessions (referral_code, created_at desc);

create index if not exists idx_referral_sessions_device_open
  on public.referral_sessions (device_id, created_at desc)
  where not consumed;

alter table public.referral_sessions enable row level security;

revoke all on public.referral_sessions from public;
grant all on public.referral_sessions to service_role;

-- ---------------------------------------------------------------------------
-- 2) Company permanent ambassador link (immutable once set)
-- ---------------------------------------------------------------------------
alter table core.companies
  add column if not exists referred_by_ambassador_id uuid references public.ambassadors (id);

create index if not exists idx_core_companies_referred_by_ambassador
  on core.companies (referred_by_ambassador_id)
  where referred_by_ambassador_id is not null;

comment on column core.companies.referred_by_ambassador_id is
  'Immutable: first qualifying ambassador attribution for this workspace (set only at creation / bind RPC).';

-- ---------------------------------------------------------------------------
-- 3) Referrals lifecycle (+ link earnings back to referral for commissioned state)
-- ---------------------------------------------------------------------------
alter table public.referrals
  add column if not exists referral_status text not null default 'signed_up'
    check (referral_status in ('pending', 'signed_up', 'active', 'subscribed', 'commissioned'));

alter table public.referrals
  add column if not exists company_id uuid;

alter table public.referrals
  add column if not exists activated_at timestamptz;

alter table public.referrals
  add column if not exists subscribed_at timestamptz;

alter table public.referrals
  add column if not exists commissioned_at timestamptz;

alter table public.referrals
  add column if not exists last_activity_at timestamptz;

-- Backfill: legacy rows (lifecycle + company_id pointers)
update public.referrals r
set
  referral_status = 'active',
  last_activity_at = coalesce(r.last_activity_at, r.created_at)
where r.referred_user_type = 'ambassador';

update public.referrals r
set
  company_id = r.referred_user_id,
  last_activity_at = coalesce(r.last_activity_at, r.created_at)
where r.referred_user_type = 'company'
  and r.company_id is distinct from r.referred_user_id;

-- Dedupe safety: one referral row per ambassador + company workspace
create unique index if not exists ux_referrals_referrer_company_workspace
  on public.referrals (referrer_id, referred_user_id)
  where referred_user_type = 'company';

create unique index if not exists ux_referrals_referrer_ambassador_child
  on public.referrals (referrer_id, referred_user_id)
  where referred_user_type = 'ambassador';

alter table public.ambassador_earnings
  add column if not exists referral_id uuid references public.referrals (id) on delete set null;

-- ---------------------------------------------------------------------------
-- 4) record_referral_session (anon + authenticated)
-- ---------------------------------------------------------------------------
create or replace function public.record_referral_session(
  p_referral_code text,
  p_device_id text default null,
  p_ip_address text default null,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, core
as $$
declare
  v_code text;
  v_amb uuid;
  v_clerk text;
begin
  v_code := upper(trim(coalesce(p_referral_code, '')));
  if v_code = '' then
    return jsonb_build_object('ok', false, 'error', 'empty_code');
  end if;

  v_amb := public.get_ambassador_id_by_referral_code(v_code);
  if v_amb is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;

  v_clerk := nullif(trim(coalesce(core.current_user_id(), '')), '');

  insert into public.referral_sessions (
    referral_code,
    device_id,
    ip_address,
    user_agent,
    clerk_user_id
  )
  values (
    v_code,
    nullif(trim(p_device_id), ''),
    nullif(trim(p_ip_address), ''),
    nullif(trim(p_user_agent), ''),
    v_clerk
  );

  return jsonb_build_object('ok', true, 'referral_code', v_code);
end;
$$;

revoke all on function public.record_referral_session(text, text, text, text) from public;
grant execute on function public.record_referral_session(text, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5) Core attribution: bind ambassador to new company (called only on INSERT path)
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

  return jsonb_build_object('ok', true, 'ambassador_id', v_amb);
end;
$$;

revoke all on function public.apply_farmer_referral_attribution(uuid, text, text, text) from public;
grant execute on function public.apply_farmer_referral_attribution(uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6) create_company_with_admin — optional referral params (defaults keep old callers working)
-- ---------------------------------------------------------------------------
create or replace function core.create_company_with_admin(
  _name text,
  _referral_code text default null,
  _referral_device_id text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = core, public
as $$
declare
  v_user_id    text;
  v_norm_name  text;
  v_company_id uuid;
  v_inserted   boolean := false;
begin
  v_user_id := core.current_user_id();
  if v_user_id is null then
    raise exception 'create_company_with_admin: unauthenticated' using errcode = '28000';
  end if;

  v_norm_name := lower(trim(_name));
  if v_norm_name is null or v_norm_name = '' then
    raise exception 'create_company_with_admin: empty company name' using errcode = '22023';
  end if;

  select c.id
  into v_company_id
  from core.companies c
  left join core.company_members m
    on m.company_id = c.id
   and m.clerk_user_id = v_user_id
  where lower(trim(c.name)) = v_norm_name
    and (c.created_by = v_user_id or m.clerk_user_id is not null)
  order by c.created_at desc
  limit 1;

  if v_company_id is null then
    insert into core.companies (name, created_by)
    values (_name, v_user_id)
    returning id into v_company_id;
    v_inserted := true;
  end if;

  insert into core.profiles (clerk_user_id, active_company_id, created_at, updated_at, user_type)
  values (v_user_id, v_company_id, now(), now(), 'company_admin')
  on conflict (clerk_user_id) do update
    set active_company_id = excluded.active_company_id,
        updated_at        = now(),
        user_type         = case
                              when core.profiles.user_type = 'ambassador' then 'both'
                              else core.profiles.user_type
                            end;

  insert into core.company_members (company_id, clerk_user_id, role)
  values (v_company_id, v_user_id, 'company_admin')
  on conflict (company_id, clerk_user_id) do update
    set role = excluded.role;

  if v_inserted then
    perform public.apply_farmer_referral_attribution(
      v_company_id,
      v_user_id,
      _referral_code,
      _referral_device_id
    );
  end if;

  return v_company_id;
end;
$$;

revoke all on function core.create_company_with_admin(text, text, text) from public;
grant execute on function core.create_company_with_admin(text, text, text) to authenticated;

create or replace function core.create_company_and_admin(_name text)
returns uuid
language sql
volatile
security definer
set search_path = core, public
as $$
  select core.create_company_with_admin(_name::text, null::text, null::text);
$$;

revoke all on function core.create_company_and_admin(text) from public;
grant execute on function core.create_company_and_admin(text) to authenticated;

drop function if exists public.create_company_with_admin(text);

create or replace function public.create_company_with_admin(
  _name text,
  _referral_code text default null,
  _referral_device_id text default null
)
returns uuid
language sql
volatile
security definer
set search_path = core, public
as $$
  select core.create_company_with_admin(_name, _referral_code, _referral_device_id);
$$;

revoke all on function public.create_company_with_admin(text, text, text) from public;
grant execute on function public.create_company_with_admin(text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7) Post-login: ensure referrals row exists if company already attributed
-- ---------------------------------------------------------------------------
create or replace function public.sync_my_farmer_referral_link()
returns jsonb
language plpgsql
security definer
set search_path = public, core
as $$
declare
  v_clerk text;
  v_company uuid;
  v_amb uuid;
begin
  v_clerk := nullif(trim(coalesce(core.current_user_id(), '')), '');
  if v_clerk is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  v_company := core.current_company_id();
  if v_company is null then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'no_company');
  end if;

  select c.referred_by_ambassador_id
  into v_amb
  from core.companies c
  where c.id = v_company
  limit 1;

  if v_amb is null then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'no_attribution');
  end if;

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
    v_company,
    'company',
    1,
    true,
    'signed_up',
    v_company,
    now()
  )
  on conflict (referrer_id, referred_user_id) where (referred_user_type = 'company') do nothing;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.sync_my_farmer_referral_link() from public;
grant execute on function public.sync_my_farmer_referral_link() to authenticated;

-- ---------------------------------------------------------------------------
-- 8) Onboarding complete (farmer) → active
-- ---------------------------------------------------------------------------
create or replace function public.mark_my_farmer_referral_onboarding_complete()
returns jsonb
language plpgsql
security definer
set search_path = public, core
as $$
declare
  v_clerk text;
  v_company uuid;
  v_amb uuid;
begin
  v_clerk := nullif(trim(coalesce(core.current_user_id(), '')), '');
  if v_clerk is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  v_company := core.current_company_id();
  if v_company is null then
    return jsonb_build_object('ok', false, 'error', 'no_company');
  end if;

  select c.referred_by_ambassador_id
  into v_amb
  from core.companies c
  where c.id = v_company
  limit 1;

  if v_amb is null then
    return jsonb_build_object('ok', true, 'skipped', true);
  end if;

  update public.referrals r
  set
    referral_status = case
      when r.referral_status in ('pending', 'signed_up') then 'active'
      else r.referral_status
    end,
    activated_at = coalesce(r.activated_at, now()),
    last_activity_at = now(),
    is_active = true
  where r.referrer_id = v_amb
    and r.referred_user_type = 'company'
    and r.referred_user_id = v_company;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.mark_my_farmer_referral_onboarding_complete() from public;
grant execute on function public.mark_my_farmer_referral_onboarding_complete() to authenticated;

-- ---------------------------------------------------------------------------
-- 9) Subscription paid → subscribed + commission row (owed)
-- ---------------------------------------------------------------------------
create or replace function public.apply_farmer_referral_subscription_commission(
  p_company_id uuid,
  p_payment_amount numeric,
  p_source text default 'unknown'
)
returns void
language plpgsql
security definer
set search_path = public, core
as $$
declare
  v_amb uuid;
  v_ref uuid;
  v_amount numeric;
  v_pay numeric;
begin
  if p_company_id is null then
    return;
  end if;

  select c.referred_by_ambassador_id
  into v_amb
  from core.companies c
  where c.id = p_company_id
  limit 1;

  if v_amb is null then
    return;
  end if;

  select r.id
  into v_ref
  from public.referrals r
  where r.referrer_id = v_amb
    and r.referred_user_type = 'company'
    and r.referred_user_id = p_company_id
  order by r.created_at asc
  limit 1;

  if v_ref is null then
    return;
  end if;

  v_pay := coalesce(p_payment_amount, 0);
  v_amount := round(v_pay * 0.10, 2);
  if v_amount <= 0 then
    v_amount := 0;
  end if;

  update public.referrals r
  set
    referral_status = case
      when r.referral_status = 'commissioned' then r.referral_status
      else 'subscribed'
    end,
    subscribed_at = coalesce(r.subscribed_at, now()),
    last_activity_at = now(),
    is_active = true
  where r.id = v_ref;

  if v_amount > 0 then
    insert into public.ambassador_earnings (
      ambassador_id,
      amount,
      type,
      status,
      description,
      referral_id
    )
    values (
      v_amb,
      v_amount,
      'farmer_subscription_commission',
      'owed',
      format('Farmer workspace subscription (%s)', coalesce(nullif(trim(p_source), ''), 'payment')),
      v_ref
    )
    on conflict ((referral_id))
    where (type = 'farmer_subscription_commission')
    do nothing;
  end if;
end;
$$;

revoke all on function public.apply_farmer_referral_subscription_commission(uuid, numeric, text) from public;
grant execute on function public.apply_farmer_referral_subscription_commission(uuid, numeric, text) to service_role;

-- Postgres partial unique index conflict target: use ON CONFLICT ON CONSTRAINT — not available for partial.
-- Use simple duplicate guard in insert instead.
drop function if exists public.apply_farmer_referral_subscription_commission(uuid, numeric, text);

create or replace function public.apply_farmer_referral_subscription_commission(
  p_company_id uuid,
  p_payment_amount numeric,
  p_source text default 'unknown'
)
returns void
language plpgsql
security definer
set search_path = public, core
as $$
declare
  v_amb uuid;
  v_ref uuid;
  v_amount numeric;
  v_pay numeric;
begin
  if p_company_id is null then
    return;
  end if;

  select c.referred_by_ambassador_id
  into v_amb
  from core.companies c
  where c.id = p_company_id
  limit 1;

  if v_amb is null then
    return;
  end if;

  select r.id
  into v_ref
  from public.referrals r
  where r.referrer_id = v_amb
    and r.referred_user_type = 'company'
    and r.referred_user_id = p_company_id
  order by r.created_at asc
  limit 1;

  if v_ref is null then
    return;
  end if;

  v_pay := coalesce(p_payment_amount, 0);
  v_amount := round(v_pay * 0.10, 2);

  update public.referrals r
  set
    referral_status = case
      when r.referral_status = 'commissioned' then r.referral_status
      else 'subscribed'
    end,
    subscribed_at = coalesce(r.subscribed_at, now()),
    last_activity_at = now(),
    is_active = true
  where r.id = v_ref;

  if v_amount > 0
     and not exists (
       select 1
       from public.ambassador_earnings e
       where e.referral_id = v_ref
         and e.type = 'farmer_subscription_commission'
     ) then
    insert into public.ambassador_earnings (
      ambassador_id,
      amount,
      type,
      status,
      description,
      referral_id
    )
    values (
      v_amb,
      v_amount,
      'farmer_subscription_commission',
      'owed',
      format('Farmer workspace subscription (%s)', coalesce(nullif(trim(p_source), ''), 'payment')),
      v_ref
    );
  end if;
end;
$$;

revoke all on function public.apply_farmer_referral_subscription_commission(uuid, numeric, text) from public;
grant execute on function public.apply_farmer_referral_subscription_commission(uuid, numeric, text) to service_role;

-- Drop partial unique index if we created it above (replaced with NOT EXISTS guard)
drop index if exists public.ux_ambassador_earnings_farmer_subscribe_per_referral;

-- ---------------------------------------------------------------------------
-- 10) M-Pesa STK activation hook
-- ---------------------------------------------------------------------------
drop function if exists public.activate_subscription_from_mpesa_stk(text);

create function public.activate_subscription_from_mpesa_stk(_checkout_request_id text)
returns uuid
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
  v_sub_payment_id uuid;
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
    return null;
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
  )
  returning id into v_sub_payment_id;

  update public.mpesa_payments
  set subscription_activated = true
  where checkout_request_id = btrim(_checkout_request_id);

  perform public.apply_farmer_referral_subscription_commission(
    v_company_id,
    coalesce(v_payment.amount, 0),
    'mpesa_stk'
  );

  return v_sub_payment_id;
end;
$$;

revoke all on function public.activate_subscription_from_mpesa_stk(text) from public;
grant execute on function public.activate_subscription_from_mpesa_stk(text) to service_role;

-- ---------------------------------------------------------------------------
-- 11) Manual approval hook
-- ---------------------------------------------------------------------------
create or replace function public.approve_subscription_payment(_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = admin, core, public
as $$
declare
  v_company_id_text text;
  v_company_id uuid;
  v_plan text;
  v_cycle text;
  v_reviewer text;
  v_period_end timestamptz;
  v_now timestamptz := clock_timestamp();
  v_old_sub_status text;
  v_old_is_trial boolean;
  v_amount numeric;
begin
  if not admin.is_developer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  v_reviewer := core.current_user_id();

  select s.status::text, coalesce(s.is_trial, false)
  into v_old_sub_status, v_old_is_trial
  from public.subscription_payments sp
  left join public.company_subscriptions s on s.company_id::text = sp.company_id
  where sp.id = _payment_id;

  update public.subscription_payments sp
  set
    status = 'approved'::public.subscription_payment_status,
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
    v_company_id := v_company_id_text::uuid;
  exception
    when invalid_text_representation then
      raise exception 'Invalid company_id on payment row' using errcode = 'P0001';
  end;

  v_plan := lower(trim(coalesce(v_plan, 'basic')));
  if v_plan not in ('basic', 'pro') then
    v_plan := case when v_plan like '%pro%' then 'pro' else 'basic' end;
  end if;

  v_cycle := lower(trim(coalesce(v_cycle, 'monthly')));
  v_period_end := v_now + interval '30 days';

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
    'manual',
    v_cycle,
    false,
    null,
    null,
    null,
    v_now,
    v_period_end,
    v_period_end,
    v_now,
    v_reviewer,
    v_now,
    v_reviewer
  )
  on conflict (company_id) do update set
    plan_id = excluded.plan_id,
    plan_code = excluded.plan_code,
    plan = excluded.plan,
    status = 'active',
    billing_mode = 'manual',
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
    active_until = v_period_end,
    trial_ends_at = null
  where id = v_company_id;

  perform public.apply_farmer_referral_subscription_commission(
    v_company_id,
    coalesce(v_amount, 0),
    'manual_approval'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 12) When commission marked paid → commissioned
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
     and new.type = 'farmer_subscription_commission' then
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

drop trigger if exists trg_ambassador_earnings_referral_commissioned on public.ambassador_earnings;
create trigger trg_ambassador_earnings_referral_commissioned
after update of status on public.ambassador_earnings
for each row
execute procedure public.trg_ambassador_earnings_referral_commissioned();

-- ---------------------------------------------------------------------------
-- 13) Ambassador registration: merge device session into referrer resolution
-- ---------------------------------------------------------------------------
drop function if exists public.register_ambassador_for_clerk(text, text, text, text, text);
drop function if exists public.register_ambassador_for_clerk(text, text, text, text, text, text);

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
  values (v_id, 200, 'signup_bonus', 'owed', 'Welcome bonus')
  on conflict (ambassador_id) where (type = 'signup_bonus') do nothing;

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

-- ---------------------------------------------------------------------------
-- 14) Dashboard referral rows — richer payload
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
                where e.referral_id = r.id and e.type = 'farmer_subscription_commission' and e.status = 'paid'
              ) then 'paid'
              when exists (
                select 1 from public.ambassador_earnings e
                where e.referral_id = r.id and e.type = 'farmer_subscription_commission' and e.status = 'owed'
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
-- 15) Backfill companies → referrals where column was added but row missing
-- ---------------------------------------------------------------------------
insert into public.referrals (
  referrer_id,
  referred_user_id,
  referred_user_type,
  level,
  is_active,
  referral_status,
  company_id,
  activated_at,
  subscribed_at,
  last_activity_at
)
select
  c.referred_by_ambassador_id,
  c.id,
  'company',
  1,
  true,
  case
    when coalesce(c.payment_confirmed, false) then 'subscribed'
    else 'signed_up'
  end,
  c.id,
  case when coalesce(c.payment_confirmed, false) then c.updated_at else null end,
  case when coalesce(c.payment_confirmed, false) then c.updated_at else null end,
  coalesce(c.updated_at, c.created_at)
from core.companies c
where c.referred_by_ambassador_id is not null
  and not exists (
    select 1
    from public.referrals r
    where r.referrer_id = c.referred_by_ambassador_id
      and r.referred_user_type = 'company'
      and r.referred_user_id = c.id
  );

commit;

notify pgrst, 'reload schema';
