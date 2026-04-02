-- When a developer approves a manual M-Pesa payment, sync public.company_subscriptions
-- to an active paid state (clear trial, set period end from billing cycle).
-- Also extend get_subscription_gate_state with billing_cycle + period dates for UI.

begin;

-- ---------------------------------------------------------------------------
-- 1) Approve payment → activate subscription for that workspace
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
    reviewed_at = v_now,
    reviewed_by = v_reviewer
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

  v_cycle := lower(trim(coalesce(v_cycle, 'monthly')));
  if v_cycle = 'seasonal' then
    v_period_end := v_now + interval '3 months';
  elsif v_cycle = 'annual' then
    v_period_end := v_now + interval '1 year';
  else
    v_cycle := 'monthly';
    v_period_end := v_now + interval '1 month';
  end if;

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

  -- Canonical company-level subscription fields (used by computeSubscriptionStatus in UI).
  update core.companies
  set
    payment_confirmed = true,
    active_until = v_period_end,
    trial_ends_at = null,
    pending_confirmation = false
  where id = v_company_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) Gate state: expose billing cycle + paid period end for billing UI / resolver
-- ---------------------------------------------------------------------------
drop function if exists public.get_subscription_gate_state();

create or replace function public.get_subscription_gate_state()
returns table (
  company_id uuid,
  company_name text,
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
    coalesce(s.plan_id, s.plan_code, 'basic')::text as selected_plan,
    coalesce(s.billing_mode, 'manual')::text as billing_mode,
    coalesce(s.status, 'pending_approval')::text as status,
    c.created_at,
    s.approved_at,
    s.approved_by,
    s.rejection_reason,
    coalesce(s.override_reason, s.override ->> 'reason') as override_reason,
    coalesce(s.is_trial, false) as is_trial,
    coalesce(s.trial_started_at, s.trial_starts_at) as trial_started_at,
    s.trial_ends_at,
    exists (
      select 1
      from admin.subscription_overrides o
      where o.company_id = c.id
        and (o.expires_at is null or o.expires_at > now())
    ) as developer_override_active,
    s.billing_cycle,
    s.current_period_end,
    s.active_until
  from core.companies c
  left join public.company_subscriptions s on s.company_id::text = c.id::text
  where c.id = v_company_id;
end;
$$;

grant execute on function public.get_subscription_gate_state() to authenticated;

commit;

notify pgrst, 'reload schema';
