-- Auto-activate 7-day Pro trial at end of onboarding (no developer approval).
-- Syncs core.companies workspace status + referral lifecycle; backfills stuck pending_approval rows.

begin;

alter table public.company_subscriptions
  add column if not exists billing_cycle text;

-- -------------------------------------------------------------------a--------
-- 1) initialize_company_subscription — immediate Pro trial (status trial)
-- ---------------------------------------------------------------------------
create or replace function public.initialize_company_subscription(
  _company_id uuid,
  _plan_code text default 'pro'
)
returns jsonb
language plpgsql
security definer
set search_path = admin, core, public
as $$
declare
  v_user_id text := core.current_user_id();
  v_now timestamptz := now();
  v_allowed boolean := false;
  v_plan text := lower(coalesce(nullif(trim(_plan_code), ''), 'pro'));
  v_trial_days int := 7;
  v_trial_end timestamptz := v_now + make_interval(days => v_trial_days);
  v_prev_approved timestamptz;
  v_prev_status text;
  v_apply_trial boolean := false;
begin
  if _company_id is null then
    raise exception 'company id is required';
  end if;

  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if v_plan not in ('basic', 'pro') then
    v_plan := 'pro';
  end if;

  select exists (
    select 1
    from core.company_members cm
    where cm.company_id::text = _company_id::text
      and cm.clerk_user_id = v_user_id
  )
  into v_allowed;

  if not v_allowed then
    raise exception 'not authorized for company %', _company_id using errcode = '42501';
  end if;

  select s.approved_at, s.status::text
  into v_prev_approved, v_prev_status
  from public.company_subscriptions s
  where s.company_id::text = _company_id::text;

  v_apply_trial :=
    v_prev_approved is null
    or lower(coalesce(v_prev_status, '')) = 'pending_approval';

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
    current_period_end,
    active_until,
    approved_at,
    approved_by,
    rejection_reason,
    override_reason,
    updated_at
  )
  values (
    _company_id,
    'pro',
    'pro',
    'pro',
    'trial',
    'trial',
    'trial',
    true,
    v_now,
    v_now,
    v_trial_end,
    null,
    v_trial_end,
    v_now,
    v_user_id,
    null,
    null,
    v_now
  )
  on conflict (company_id) do update set
    plan_id = case when v_apply_trial then excluded.plan_id else public.company_subscriptions.plan_id end,
    plan_code = case when v_apply_trial then excluded.plan_code else public.company_subscriptions.plan_code end,
    plan = case when v_apply_trial then excluded.plan else public.company_subscriptions.plan end,
    status = case when v_apply_trial then excluded.status else public.company_subscriptions.status end,
    billing_mode = case when v_apply_trial then excluded.billing_mode else public.company_subscriptions.billing_mode end,
    billing_cycle = case when v_apply_trial then excluded.billing_cycle else public.company_subscriptions.billing_cycle end,
    is_trial = case when v_apply_trial then excluded.is_trial else public.company_subscriptions.is_trial end,
    trial_started_at = case
      when v_apply_trial then coalesce(public.company_subscriptions.trial_started_at, excluded.trial_started_at)
      else public.company_subscriptions.trial_started_at
    end,
    trial_starts_at = case
      when v_apply_trial then coalesce(public.company_subscriptions.trial_starts_at, excluded.trial_starts_at)
      else public.company_subscriptions.trial_starts_at
    end,
    trial_ends_at = case when v_apply_trial then excluded.trial_ends_at else public.company_subscriptions.trial_ends_at end,
    current_period_end = case
      when v_apply_trial then excluded.current_period_end
      else public.company_subscriptions.current_period_end
    end,
    active_until = case when v_apply_trial then excluded.active_until else public.company_subscriptions.active_until end,
    approved_at = case when v_apply_trial then coalesce(public.company_subscriptions.approved_at, excluded.approved_at) else public.company_subscriptions.approved_at end,
    approved_by = case when v_apply_trial then coalesce(public.company_subscriptions.approved_by, excluded.approved_by) else public.company_subscriptions.approved_by end,
    rejection_reason = case when v_apply_trial then null else public.company_subscriptions.rejection_reason end,
    override_reason = public.company_subscriptions.override_reason,
    updated_at = v_now;

  if v_apply_trial then
    update core.companies c
    set
      status = 'active',
      plan = 'pro',
      trial_ends_at = v_trial_end,
      payment_confirmed = false,
      active_until = null,
      pending_confirmation = false,
      updated_at = v_now
    where c.id = _company_id;

    update public.referrals r
    set
      referral_status = case
        when r.referral_status in ('pending', 'signed_up') then 'active'
        else r.referral_status
      end,
      activated_at = coalesce(r.activated_at, v_now),
      last_activity_at = v_now,
      is_active = true
    where r.referred_user_type = 'company'
      and r.referred_user_id = _company_id;
  end if;

  return jsonb_build_object(
    'success', true,
    'company_id', _company_id::text,
    'status', case when v_apply_trial then 'trial' else coalesce(v_prev_status, 'trial') end,
    'plan_code', 'pro',
    'trial_ends_at', (select trial_ends_at from public.company_subscriptions where company_id::text = _company_id::text limit 1)
  );
end;
$$;

grant execute on function public.initialize_company_subscription(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2) start_trial fallback — align with auto-trial + company row
-- ---------------------------------------------------------------------------
drop function if exists public.start_trial(uuid, text, timestamptz);
drop function if exists public.start_trial(uuid, text);
drop function if exists public.start_trial(uuid);

create or replace function public.start_trial(
  p_company_id uuid,
  p_plan_id text default 'pro_trial',
  p_trial_ends_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = core, public
as $$
declare
  v_ends_at timestamptz;
  v_user_id text := core.current_user_id();
  v_plan text;
  v_allowed boolean;
  v_now timestamptz := now();
begin
  if p_company_id is null then
    raise exception 'company id is required';
  end if;

  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select exists (
    select 1
    from core.company_members cm
    where cm.company_id::text = p_company_id::text
      and cm.clerk_user_id = v_user_id
  )
  into v_allowed;

  if not v_allowed then
    raise exception 'not authorized for company %', p_company_id using errcode = '42501';
  end if;

  v_ends_at := coalesce(p_trial_ends_at, v_now + interval '7 days');

  v_plan := lower(coalesce(nullif(trim(p_plan_id), ''), 'pro'));
  if v_plan in ('pro_trial', 'professional') then
    v_plan := 'pro';
  end if;
  if v_plan not in ('basic', 'pro') then
    v_plan := 'pro';
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
    current_period_end,
    active_until,
    approved_at,
    approved_by,
    updated_at
  )
  values (
    p_company_id,
    v_plan,
    v_plan,
    v_plan,
    'trialing',
    'trial',
    'trial',
    true,
    v_now,
    v_now,
    v_ends_at,
    null,
    v_ends_at,
    v_now,
    v_user_id,
    v_now
  )
  on conflict (company_id) do update set
    plan_id = excluded.plan_id,
    plan_code = coalesce(excluded.plan_code, public.company_subscriptions.plan_code),
    plan = coalesce(excluded.plan, public.company_subscriptions.plan),
    status = excluded.status,
    billing_mode = coalesce(excluded.billing_mode, public.company_subscriptions.billing_mode),
    billing_cycle = coalesce(excluded.billing_cycle, public.company_subscriptions.billing_cycle),
    is_trial = true,
    trial_started_at = coalesce(public.company_subscriptions.trial_started_at, excluded.trial_started_at),
    trial_starts_at = coalesce(public.company_subscriptions.trial_starts_at, excluded.trial_starts_at),
    trial_ends_at = excluded.trial_ends_at,
    current_period_end = null,
    active_until = excluded.active_until,
    approved_at = coalesce(public.company_subscriptions.approved_at, excluded.approved_at),
    approved_by = coalesce(public.company_subscriptions.approved_by, excluded.approved_by),
    updated_at = v_now;

  update core.companies c
  set
    status = 'active',
    plan = case when v_plan = 'pro' then 'pro' else c.plan end,
    trial_ends_at = v_ends_at,
    payment_confirmed = false,
    active_until = null,
    pending_confirmation = false,
    updated_at = v_now
  where c.id = p_company_id;

  update public.referrals r
  set
    referral_status = case
      when r.referral_status in ('pending', 'signed_up') then 'active'
      else r.referral_status
    end,
    activated_at = coalesce(r.activated_at, v_now),
    last_activity_at = v_now,
    is_active = true
  where r.referred_user_type = 'company'
    and r.referred_user_id = p_company_id;
end;
$$;

grant execute on function public.start_trial(uuid, text, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Referral row at first sync: signed_up + inactive until onboarding completes
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
    false,
    'signed_up',
    v_company,
    now()
  )
  on conflict do nothing;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.sync_my_farmer_referral_link() from public;
grant execute on function public.sync_my_farmer_referral_link() to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Backfill: pending_approval + trial intent → live trial
-- ---------------------------------------------------------------------------
update public.company_subscriptions s
set
  status = 'trial',
  plan_id = coalesce(nullif(s.plan_id, ''), 'pro'),
  plan_code = coalesce(nullif(s.plan_code, ''), 'pro'),
  plan = coalesce(nullif(s.plan, ''), 'pro'),
  billing_mode = case when lower(coalesce(s.billing_mode, '')) in ('', 'manual') then 'trial' else s.billing_mode end,
  billing_cycle = coalesce(nullif(s.billing_cycle, ''), 'trial'),
  is_trial = true,
  trial_started_at = coalesce(s.trial_started_at, s.trial_starts_at, now()),
  trial_starts_at = coalesce(s.trial_starts_at, s.trial_started_at, now()),
  trial_ends_at = coalesce(s.trial_ends_at, now() + interval '7 days'),
  current_period_end = null,
  active_until = coalesce(s.trial_ends_at, now() + interval '7 days'),
  approved_at = coalesce(s.approved_at, now()),
  approved_by = coalesce(s.approved_by, 'system:auto_trial_backfill'),
  updated_at = now()
where lower(coalesce(s.status, '')) = 'pending_approval'
  and (
    coalesce(s.is_trial, false) = true
    or lower(coalesce(s.plan_code, s.plan_id, '')) like 'pro%'
  );

update core.companies c
set
  status = 'active',
  plan = case when lower(coalesce(c.plan, '')) in ('', 'pending') then 'pro' else c.plan end,
  trial_ends_at = coalesce(
    c.trial_ends_at,
    (select s.trial_ends_at from public.company_subscriptions s where s.company_id::text = c.id::text limit 1),
    now() + interval '7 days'
  ),
  payment_confirmed = coalesce(c.payment_confirmed, false),
  active_until = null,
  pending_confirmation = false,
  updated_at = now()
where c.status::text = 'pending'
  and exists (
    select 1
    from public.company_subscriptions s
    where s.company_id::text = c.id::text
      and lower(coalesce(s.status, '')) in ('trial', 'trialing')
  );

commit;

notify pgrst, 'reload schema';
