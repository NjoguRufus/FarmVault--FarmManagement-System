-- Multi-step company onboarding: onboarding_completed gate, company subscription snapshot columns,
-- current_context exposes onboarding_completed, trial activation writes trialing/pro_trial on companies.

begin;

-- ---------------------------------------------------------------------------
-- 1) core.companies — onboarding + subscription snapshot (mirrors trial step)
-- ---------------------------------------------------------------------------
alter table core.companies
  add column if not exists onboarding_completed boolean not null default false;

alter table core.companies
  add column if not exists subscription_status text;

alter table core.companies
  add column if not exists access_level text;

alter table core.companies
  add column if not exists trial_started_at timestamptz;

-- Existing workspaces: treat as fully onboarded (new companies default onboarding_completed = false).
update core.companies c
set onboarding_completed = true;

-- ---------------------------------------------------------------------------
-- 2) core.create_company_with_admin — defaults: basic / pending / not onboarded
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
    insert into core.companies (
      name,
      created_by,
      plan,
      subscription_status,
      access_level,
      onboarding_completed,
      status
    )
    values (
      _name,
      v_user_id,
      'basic',
      'pending',
      'basic',
      false,
      'pending'
    )
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

-- ---------------------------------------------------------------------------
-- 3) initialize_company_subscription — sync companies.subscription_status / access_level / trial_started_at
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
    or lower(coalesce(v_prev_status, '')) in ('pending_approval', 'pending');

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
      subscription_status = 'trialing',
      access_level = 'pro_trial',
      trial_started_at = v_now,
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
-- 4) complete_company_onboarding — final step (company admin only)
-- ---------------------------------------------------------------------------
create or replace function public.complete_company_onboarding(_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = core, public
as $$
declare
  v_uid text := core.current_user_id();
  v_ok boolean := false;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if _company_id is null then
    raise exception 'company id is required';
  end if;

  select exists (
    select 1
    from core.company_members m
    where m.company_id = _company_id
      and m.clerk_user_id = v_uid
      and lower(trim(m.role)) in ('company_admin', 'company-admin', 'owner', 'admin')
  )
  into v_ok;

  if not v_ok then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  update core.companies c
  set
    onboarding_completed = true,
    updated_at = now()
  where c.id = _company_id;

  return jsonb_build_object('success', true, 'company_id', _company_id::text);
end;
$$;

revoke all on function public.complete_company_onboarding(uuid) from public;
grant execute on function public.complete_company_onboarding(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5) current_context — third column onboarding_completed
-- ---------------------------------------------------------------------------
-- Postgres cannot change RETURNS TABLE column set with CREATE OR REPLACE (42P13).
drop function if exists public.current_context();

create function public.current_context()
returns table (company_id uuid, role text, onboarding_completed boolean)
language plpgsql
stable
security definer
set search_path = core, public
as $$
declare
  v_user_id    text;
  v_company_id uuid;
  v_role       text;
  v_creator    boolean;
  rlow         text;
  v_member     boolean;
  v_onboarding_completed boolean;
begin
  v_user_id := core.current_user_id();
  if v_user_id is null then
    return;
  end if;

  select p.active_company_id
    into v_company_id
    from core.profiles p
    where p.clerk_user_id = v_user_id
    limit 1;

  if v_company_id is not null then
    v_member := false;
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'core' and table_name = 'company_members' and column_name = 'clerk_user_id'
    ) then
      select exists (
        select 1 from core.company_members m
        where m.company_id = v_company_id and m.clerk_user_id = v_user_id
      ) into v_member;
    elsif exists (
      select 1 from information_schema.columns
      where table_schema = 'core' and table_name = 'company_members' and column_name = 'user_id'
    ) then
      select exists (
        select 1 from core.company_members m
        where m.company_id = v_company_id and m.user_id = v_user_id
      ) into v_member;
    end if;

    if not coalesce(v_member, false) then
      select exists (
        select 1 from public.company_members m
        where m.company_id = v_company_id and m.user_id = v_user_id
      ) into v_member;
    end if;

    if not v_member then
      select exists (
        select 1
        from core.companies c
        where c.id = v_company_id
          and coalesce(trim(c.created_by), '') = v_user_id
      )
        into v_creator;
      if not coalesce(v_creator, false) then
        v_company_id := null;
      end if;
    end if;
  end if;

  if v_company_id is null then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'core' and table_name = 'company_members' and column_name = 'clerk_user_id'
    ) then
      select m.company_id
        into v_company_id
      from core.company_members m
      where m.clerk_user_id = v_user_id
      order by m.created_at desc nulls last
      limit 1;
    elsif exists (
      select 1 from information_schema.columns
      where table_schema = 'core' and table_name = 'company_members' and column_name = 'user_id'
    ) then
      select m.company_id
        into v_company_id
      from core.company_members m
      where m.user_id = v_user_id
      order by m.created_at desc nulls last
      limit 1;
    end if;
  end if;

  if v_company_id is null then
    return;
  end if;

  v_role := null;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'core' and table_name = 'company_members' and column_name = 'clerk_user_id'
  ) then
    select m.role
      into v_role
    from core.company_members m
    where m.company_id = v_company_id
      and m.clerk_user_id = v_user_id
    limit 1;
  elsif exists (
    select 1 from information_schema.columns
    where table_schema = 'core' and table_name = 'company_members' and column_name = 'user_id'
  ) then
    select m.role
      into v_role
    from core.company_members m
    where m.company_id = v_company_id
      and m.user_id = v_user_id
    limit 1;
  end if;

  if v_role is null then
    select m.role
      into v_role
    from public.company_members m
    where m.company_id = v_company_id
      and m.user_id = v_user_id
    limit 1;
  end if;

  select exists (
    select 1
    from core.companies c
    where c.id = v_company_id
      and coalesce(trim(c.created_by), '') = v_user_id
  )
    into v_creator;

  rlow := lower(coalesce(nullif(trim(v_role), ''), 'employee'));

  if coalesce(v_creator, false) and rlow in ('employee', 'staff', 'member', 'user', '') then
    v_role := 'company_admin';
  end if;

  select c.onboarding_completed
  into v_onboarding_completed
  from core.companies c
  where c.id = v_company_id
  limit 1;

  company_id := v_company_id;
  role := coalesce(nullif(trim(v_role), ''), 'employee');
  onboarding_completed := coalesce(v_onboarding_completed, true);
  return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6) list_companies — expose company subscription snapshot for developer UI
-- ---------------------------------------------------------------------------
create or replace function public.list_companies(
  p_search text default null,
  p_limit int default 200,
  p_offset int default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = admin, core, public
as $$
declare
  v_result jsonb;
  v_total bigint;
  v_plan_expr text;
  v_trial_start_expr text;
  v_active_until_expr text;
  v_billing_mode_expr text;
  v_billing_cycle_expr text;
  v_sql text;
begin
  if not admin.is_developer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select count(*) into v_total
  from core.companies c
  where (p_search is null or p_search = '' or c.name ilike '%' || p_search || '%');

  v_plan_expr := case
    when exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'company_subscriptions' and column_name = 'plan_code'
    ) then 'coalesce(cs.plan_code, cs.plan_id, ''basic'')'
    else 'coalesce(cs.plan_id, ''basic'')'
  end;

  v_trial_start_expr := case
    when exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'company_subscriptions' and column_name = 'trial_starts_at'
    ) then 'cs.trial_starts_at'
    else 'cs.trial_started_at'
  end;

  v_active_until_expr := case
    when exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'company_subscriptions' and column_name = 'active_until'
    ) then 'coalesce(c.active_until, cs.active_until)'
    else 'coalesce(c.active_until, cs.current_period_end)'
  end;

  v_billing_mode_expr := case
    when exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'company_subscriptions' and column_name = 'billing_mode'
    ) then 'cs.billing_mode'
    else '(cs.override->>''billing_mode'')'
  end;

  v_billing_cycle_expr := case
    when exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'company_subscriptions' and column_name = 'billing_cycle'
    ) then 'cs.billing_cycle'
    else '(cs.override->>''billing_cycle'')'
  end;

  v_sql := format($f$
    select jsonb_build_object(
      'rows', coalesce(jsonb_agg(row_data order by (row_data->>'created_at')::timestamptz desc nulls last), '[]'::jsonb),
      'total', %s
    )
    from (
      select jsonb_build_object(
        'company_id', c.id,
        'company_name', c.name,
        'created_at', c.created_at,
        'users_count', (
          select count(*) from core.company_members cm where cm.company_id::text = c.id::text
        ),
        'employees_count', (
          select count(*) from public.employees e where e.company_id::text = c.id::text
        ),
        'plan', c.plan,
        'payment_confirmed', c.payment_confirmed,
        'pending_confirmation', c.pending_confirmation,
        'company_subscription_status', c.subscription_status,
        'access_level', c.access_level,
        'onboarding_completed', c.onboarding_completed,
        'company_trial_started_at', c.trial_started_at,
        'subscription_status', coalesce(cs.status, 'none'),
        'plan_code', %s,
        'billing_mode', %s,
        'billing_cycle', %s,
        'is_trial', coalesce(cs.is_trial, cs.status = 'trialing', false),
        'trial_ends_at', coalesce(c.trial_ends_at, cs.trial_ends_at),
        'active_until', %s,
        'override_reason', coalesce(cs.override_reason, cs.override->>'reason'),
        'override_by', coalesce(cs.override_by, cs.override->>'granted_by'),
        'override', cs.override,
        'latest_subscription_payment', case
          when to_regclass('public.subscription_payments') is null then null::jsonb
          else (
            select jsonb_build_object(
              'id', sp.id,
              'status', sp.status::text,
              'amount', sp.amount,
              'currency', sp.currency,
              'plan_id', sp.plan_id,
              'billing_cycle', sp.billing_cycle,
              'billing_mode', sp.billing_mode,
              'payment_method', sp.payment_method::text,
              'submitted_at', coalesce(sp.submitted_at, sp.created_at),
              'mpesa_name', sp.mpesa_name,
              'transaction_code', sp.transaction_code
            )
            from public.subscription_payments sp
            where sp.company_id = c.id::text
            order by coalesce(sp.submitted_at, sp.created_at) desc nulls last
            limit 1
          )
        end,
        'subscription', jsonb_build_object(
          'plan', %s,
          'plan_code', %s,
          'status', cs.status,
          'is_trial', coalesce(cs.is_trial, cs.status = 'trialing', false),
          'trial_start', %s,
          'trial_end', coalesce(c.trial_ends_at, cs.trial_ends_at),
          'active_until', %s,
          'billing_mode', %s,
          'billing_cycle', %s
        )
      ) as row_data
      from core.companies c
      left join public.company_subscriptions cs on cs.company_id::text = c.id::text
      where (coalesce(%L, '') = '' or c.name ilike '%%' || %L || '%%')
      order by c.created_at desc nulls last
      limit %s
      offset %s
    ) q
  $f$,
    v_total,
    v_plan_expr,
    v_billing_mode_expr,
    v_billing_cycle_expr,
    v_active_until_expr,
    v_plan_expr,
    v_plan_expr,
    v_trial_start_expr,
    v_active_until_expr,
    v_billing_mode_expr,
    v_billing_cycle_expr,
    p_search, p_search, p_limit, p_offset
  );

  execute v_sql into v_result;
  return coalesce(v_result, '{"rows": [], "total": 0}'::jsonb);
end;
$$;

grant execute on function public.list_companies(text, int, int) to authenticated;

grant execute on function public.current_context() to authenticated;

commit;

notify pgrst, 'reload schema';
