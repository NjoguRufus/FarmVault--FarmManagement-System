-- Fix developer billing confirmation lifecycle + ordering.
-- 1) Ensure subscription_payments has approved_by for audit/UI.
-- 2) Ensure approve/reject RPCs set/clear fields consistently.
-- 3) Extend list_payments_v2 to include payment_method + reference + approved_by
--    and order by review/approval time so newly approved rows appear immediately.

begin;

-- ---------------------------------------------------------------------------
-- 0) Schema: add approved_by if missing
-- ---------------------------------------------------------------------------
alter table public.subscription_payments
  add column if not exists approved_by text;

-- ---------------------------------------------------------------------------
-- 1) Approval: fully update lifecycle fields
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
  returning sp.company_id, sp.plan_id, sp.billing_cycle
  into v_company_id_text, v_plan, v_cycle;

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

  -- Canonical rule for FarmVault: manual approval grants 30 days access window
  -- (independent of any legacy billing_cycle stored on the payment row).
  v_cycle := lower(trim(coalesce(v_cycle, 'monthly')));
  v_period_end := v_now + interval '30 days';

  raise notice '[approve_subscription_payment] company=% subscription before: status=% is_trial=% → activating paid plan=% cycle=% until=%',
    v_company_id, coalesce(v_old_sub_status, '(no row)'), coalesce(v_old_is_trial::text, '?'),
    v_plan, v_cycle, v_period_end;

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

  raise notice '[approve_subscription_payment] company=% subscription after: status=active is_trial=false current_period_end=% active_until=%',
    v_company_id, v_period_end, v_period_end;

  -- Canonical company record used by unified status resolver
  update core.companies
  set
    plan = v_plan,
    payment_confirmed = true,
    pending_confirmation = false,
    active_until = v_period_end,
    trial_ends_at = null
  where id = v_company_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) Rejection: set rejected fields and clear approval fields
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
begin
  if not admin.is_developer() then
    raise exception 'not authorized' using errcode = '42501';
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

-- ---------------------------------------------------------------------------
-- 3) Payments listing: include lifecycle fields + stable ordering
-- ---------------------------------------------------------------------------
-- NOTE: Postgres cannot change OUT/return columns via CREATE OR REPLACE.
-- We must DROP first because earlier migrations defined list_payments_v2 with fewer columns.
drop function if exists public.list_payments_v2(text, text, text, timestamptz, timestamptz, text, int, int);

create or replace function public.list_payments_v2(
  _status text default 'pending',
  _billing_mode text default null,
  _plan text default null,
  _date_from timestamptz default null,
  _date_to timestamptz default null,
  _search text default null,
  _limit int default 50,
  _offset int default 0
)
returns table (
  id uuid,
  company_id text,
  company_name text,
  plan_id text,
  amount numeric,
  currency text,
  status text,
  billing_mode text,
  payment_method text,
  reference text,
  created_at timestamptz,
  approved_at timestamptz,
  approved_by text,
  reviewed_at timestamptz,
  reviewed_by text
)
language plpgsql
stable
security definer
set search_path = admin, core, public
as $$
begin
  if not admin.is_developer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return query
  select
    sp.id,
    sp.company_id,
    c.name::text as company_name,
    sp.plan_id,
    sp.amount,
    sp.currency,
    sp.status::text,
    sp.billing_mode,
    sp.payment_method,
    sp.transaction_code as reference,
    sp.created_at,
    sp.approved_at,
    coalesce(sp.approved_by, sp.reviewed_by) as approved_by,
    sp.reviewed_at,
    sp.reviewed_by
  from public.subscription_payments sp
  left join core.companies c on c.id::text = sp.company_id
  where
    (
      _status = 'all'
      or sp.status::text = _status
      or (
        _status = 'pending'
        and sp.status in (
          'pending'::public.subscription_payment_status,
          'pending_verification'::public.subscription_payment_status
        )
      )
    )
    and (_billing_mode is null or sp.billing_mode = _billing_mode)
    and (_plan is null or sp.plan_id = _plan)
    and (_date_from is null or coalesce(sp.reviewed_at, sp.approved_at, sp.submitted_at, sp.created_at) >= _date_from)
    and (_date_to is null or coalesce(sp.reviewed_at, sp.approved_at, sp.submitted_at, sp.created_at) <= _date_to)
    and (
      _search is null
      or _search = ''
      or c.name ilike '%' || _search || '%'
      or sp.company_id::text ilike '%' || _search || '%'
      or sp.transaction_code ilike '%' || _search || '%'
    )
  order by coalesce(sp.reviewed_at, sp.approved_at, sp.submitted_at, sp.created_at) desc nulls last
  limit _limit
  offset _offset;
end;
$$;

grant execute on function public.list_payments_v2(text, text, text, timestamptz, timestamptz, text, int, int) to authenticated;

commit;

notify pgrst, 'reload schema';

