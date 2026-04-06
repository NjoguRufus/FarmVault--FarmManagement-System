-- 1) Manual payment approval: sync core.companies snapshot + correct billing period by cycle (match STK).
-- 2) get_subscription_gate_state: if an approved subscription_payment exists but subscription row is still
--    trial/trialing, expose active paid state (fixes torn reads + stale UI).
-- 3) list_company_payments + RLS: normalize company_id text comparison (trim + lower).
-- 4) Backfill: companies + company_subscriptions for workspaces with approved payments still in trial snapshot.
-- 5) Realtime-friendly replica identity for billing tables (postgres_changes filters).

begin;

-- ---------------------------------------------------------------------------
-- approve_subscription_payment — companies snapshot + period by cycle
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
  v_period_end       timestamptz;
  v_now              timestamptz := clock_timestamp();
  v_amount           numeric;
begin
  if not admin.is_developer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  v_reviewer := core.current_user_id();

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
  if v_cycle = 'seasonal' then
    v_period_end := v_now + interval '3 months';
  elsif v_cycle = 'annual' then
    v_period_end := v_now + interval '1 year';
  else
    v_cycle := 'monthly';
    v_period_end := v_now + interval '1 month';
  end if;

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
    plan_id              = excluded.plan_id,
    plan_code            = excluded.plan_code,
    plan                 = excluded.plan,
    status               = 'active',
    billing_mode         = 'manual',
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
    payment_confirmed    = true,
    pending_confirmation = false,
    active_until         = v_period_end,
    trial_ends_at        = null,
    trial_started_at     = null,
    subscription_status  = 'active',
    access_level         = v_plan,
    updated_at           = v_now
  where id = v_company_id;

  perform public.apply_farmer_referral_subscription_commission(
    v_company_id,
    coalesce(v_amount, 0),
    'manual_approval'
  );
end;
$$;

grant execute on function public.approve_subscription_payment(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- get_subscription_gate_state — approved payment wins over stale trial row
-- ---------------------------------------------------------------------------
drop function if exists public.get_subscription_gate_state();

create or replace function public.get_subscription_gate_state()
returns table (
  company_id uuid,
  company_name text,
  company_status text,
  billing_reference text,
  selected_plan text,
  billing_mode text,
  status text,
  created_at timestamptz,
  approved_at timestamptz,
  approved_by text,
  rejection_reason text,
  override_reason text,
  is_trial boolean,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  developer_override_active boolean,
  billing_cycle text,
  current_period_end timestamptz,
  active_until timestamptz
)
language plpgsql
stable
security definer
set search_path = admin, core, public
as $$
declare
  v_company_id uuid;
begin
  v_company_id := core.current_company_id();

  if v_company_id is null then
    return;
  end if;

  return query
  select
    c.id as company_id,
    c.name as company_name,
    c.status::text as company_status,
    nullif(btrim(c.billing_reference::text), '') as billing_reference,
    coalesce(
      case
        when g.eff_status = 'active' and pay.pay_plan is not null and btrim(pay.pay_plan) <> '' then
          case
            when lower(pay.pay_plan) like '%pro%' then 'pro'::text
            else 'basic'::text
          end
        else null
      end,
      s.plan_id,
      s.plan_code,
      'basic'
    )::text as selected_plan,
    coalesce(s.billing_mode, 'manual')::text as billing_mode,
    g.eff_status::text as status,
    c.created_at,
    s.approved_at,
    s.approved_by,
    s.rejection_reason,
    coalesce(s.override_reason, s.override ->> 'reason') as override_reason,
    case
      when g.eff_status = 'active' then false
      else coalesce(s.is_trial, false)
    end as is_trial,
    case
      when g.eff_status = 'active' then null::timestamptz
      else coalesce(s.trial_started_at, s.trial_starts_at)
    end as trial_started_at,
    case
      when g.eff_status = 'active' then null::timestamptz
      else s.trial_ends_at
    end as trial_ends_at,
    exists (
      select 1
      from admin.subscription_overrides o
      where o.company_id = c.id
        and (o.expires_at is null or o.expires_at > now())
    ) as developer_override_active,
    s.billing_cycle,
    coalesce(s.current_period_end, c.active_until) as current_period_end,
    coalesce(s.active_until, c.active_until) as active_until
  from core.companies c
  left join public.company_subscriptions s on s.company_id::text = c.id::text
  cross join lateral (
    select
      exists (
        select 1
        from public.subscription_payments sp
        where lower(btrim(sp.company_id)) = lower(btrim(c.id::text))
          and sp.status = 'approved'::public.subscription_payment_status
      ) as has_approved,
      (
        select sp.plan_id::text
        from public.subscription_payments sp
        where lower(btrim(sp.company_id)) = lower(btrim(c.id::text))
          and sp.status = 'approved'::public.subscription_payment_status
        order by sp.approved_at desc nulls last, sp.created_at desc
        limit 1
      ) as pay_plan
  ) pay
  cross join lateral (
    select
      case
        when pay.has_approved
          and (
            s.company_id is null
            or lower(btrim(coalesce(s.status::text, ''))) in ('trial', 'trialing')
          )
        then 'active'::text
        else coalesce(s.status::text, 'pending_approval')
      end as eff_status
  ) g
  where c.id = v_company_id;
end;
$$;

grant execute on function public.get_subscription_gate_state() to authenticated;

-- ---------------------------------------------------------------------------
-- list_company_payments — tolerant company_id match
-- ---------------------------------------------------------------------------
create or replace function public.list_company_payments(
  _company_id uuid
)
returns table (
  id               uuid,
  company_id       text,
  plan_id          text,
  amount           numeric,
  status           text,
  billing_mode     text,
  billing_cycle    text,
  currency         text,
  payment_method   text,
  mpesa_name       text,
  mpesa_phone      text,
  transaction_code text,
  notes            text,
  created_at       timestamptz,
  submitted_at     timestamptz,
  approved_at      timestamptz
)
language plpgsql
stable
security definer
set search_path = public, core, admin
as $$
declare
  v_caller_id text;
  v_is_member boolean := false;
  v_cid_norm  text;
begin
  v_cid_norm := lower(btrim(_company_id::text));

  v_caller_id := nullif(trim(coalesce(auth.jwt() ->> 'sub', '')), '');

  if v_caller_id is null then
    return;
  end if;

  if admin.is_developer() then
    return query
      select
        sp.id,
        sp.company_id,
        sp.plan_id,
        sp.amount,
        sp.status::text,
        sp.billing_mode,
        sp.billing_cycle,
        sp.currency,
        sp.payment_method,
        sp.mpesa_name,
        sp.mpesa_phone,
        sp.transaction_code,
        sp.notes,
        sp.created_at,
        sp.submitted_at,
        sp.approved_at
      from public.subscription_payments sp
      where lower(btrim(sp.company_id)) = v_cid_norm
      order by sp.created_at desc;
    return;
  end if;

  select exists (
    select 1
    from core.company_members m
    where m.company_id = _company_id
      and m.clerk_user_id = v_caller_id
  ) into v_is_member;

  if not v_is_member then
    select exists (
      select 1
      from core.profiles p
      where p.clerk_user_id = v_caller_id
        and p.active_company_id = _company_id
    ) into v_is_member;
  end if;

  if not v_is_member then
    return;
  end if;

  return query
    select
      sp.id,
      sp.company_id,
      sp.plan_id,
      sp.amount,
      sp.status::text,
      sp.billing_mode,
      sp.billing_cycle,
      sp.currency,
      sp.payment_method,
      sp.mpesa_name,
      sp.mpesa_phone,
      sp.transaction_code,
      sp.notes,
      sp.created_at,
      sp.submitted_at,
      sp.approved_at
    from public.subscription_payments sp
    where lower(btrim(sp.company_id)) = v_cid_norm
    order by sp.created_at desc;
end;
$$;

revoke all on function public.list_company_payments(uuid) from public;
grant execute on function public.list_company_payments(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RLS: subscription_payments select — normalize ids
-- ---------------------------------------------------------------------------
drop policy if exists subscription_payments_select on public.subscription_payments;

create policy subscription_payments_select on public.subscription_payments
  for select
  using (
    public.is_developer()
    or (
      public.current_company_id() is not null
      and lower(btrim(company_id)) = lower(btrim(public.current_company_id()::text))
    )
  );

-- ---------------------------------------------------------------------------
-- Backfill: latest approved payment per company → sync trial drift
-- ---------------------------------------------------------------------------
with latest as (
  select distinct on (lower(btrim(sp.company_id)))
    lower(btrim(sp.company_id)) as company_id_norm,
    sp.company_id,
    sp.plan_id,
    sp.billing_cycle,
    sp.approved_at,
    sp.created_at
  from public.subscription_payments sp
  where sp.status = 'approved'::public.subscription_payment_status
    and sp.company_id is not null
    and btrim(sp.company_id) <> ''
  order by lower(btrim(sp.company_id)), sp.approved_at desc nulls last, sp.created_at desc
),
norm as (
  select
    company_id_norm,
    company_id,
    case
      when lower(btrim(coalesce(plan_id, ''))) like '%pro%' then 'pro'::text
      else 'basic'::text
    end as plan_norm,
    lower(btrim(coalesce(nullif(btrim(billing_cycle::text), ''), 'monthly'))) as cycle_norm
  from latest
)
update public.company_subscriptions s
set
  plan_id          = n.plan_norm,
  plan_code        = n.plan_norm,
  plan             = n.plan_norm,
  status           = 'active',
  billing_cycle    = case
    when n.cycle_norm in ('seasonal', 'annual', 'monthly') then n.cycle_norm
    else s.billing_cycle
  end,
  is_trial         = false,
  trial_started_at = null,
  trial_starts_at  = null,
  trial_ends_at    = null,
  updated_at       = clock_timestamp()
from norm n
where lower(btrim(s.company_id::text)) = n.company_id_norm
  and lower(btrim(coalesce(s.status::text, ''))) in ('trial', 'trialing');

with latest as (
  select distinct on (lower(btrim(sp.company_id)))
    lower(btrim(sp.company_id)) as company_id_norm,
    sp.company_id,
    sp.plan_id,
    sp.approved_at,
    sp.created_at
  from public.subscription_payments sp
  where sp.status = 'approved'::public.subscription_payment_status
    and sp.company_id is not null
    and btrim(sp.company_id) <> ''
  order by lower(btrim(sp.company_id)), sp.approved_at desc nulls last, sp.created_at desc
),
norm as (
  select
    company_id_norm,
    case
      when lower(btrim(coalesce(plan_id, ''))) like '%pro%' then 'pro'::text
      else 'basic'::text
    end as plan_norm
  from latest
)
update core.companies c
set
  subscription_status  = 'active',
  access_level         = n.plan_norm,
  plan                 = n.plan_norm,
  trial_ends_at        = null,
  trial_started_at     = null,
  payment_confirmed    = true,
  pending_confirmation = false,
  active_until         = coalesce(
    c.active_until,
    (select cs.active_until from public.company_subscriptions cs where cs.company_id::text = c.id::text limit 1),
    (select cs.current_period_end from public.company_subscriptions cs where cs.company_id::text = c.id::text limit 1)
  ),
  updated_at           = clock_timestamp()
from norm n
where lower(btrim(c.id::text)) = n.company_id_norm
  and (
    lower(btrim(coalesce(c.subscription_status, ''))) in ('trialing', 'trial')
    or c.trial_ends_at is not null
  );

-- ---------------------------------------------------------------------------
-- Realtime: full row for filtered postgres_changes
-- ---------------------------------------------------------------------------
alter table public.subscription_payments replica identity full;
alter table public.company_subscriptions replica identity full;

commit;

notify pgrst, 'reload schema';
