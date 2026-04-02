-- Developer Platform Phase 1 backend unblockers
-- Purpose: Enable /developer, /developer/companies, /developer/users, /developer/billing-confirmation, /developer/billing
-- All gated by admin.is_developer() (admin.developers table + core.current_user_id()).
-- Dependency order: billing views → admin function updates → public wrappers → new RPCs.

begin;

-- =============================================================================
-- 1) Billing schema: views so admin.dev_dashboard_kpis and admin.list_companies work
-- =============================================================================

-- admin.list_companies() joins core.companies with billing.company_subscriptions.
-- Create view over public.company_subscriptions with columns list_companies expects.
create schema if not exists billing;

do $$
begin
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'billing'
      and c.relname = 'company_subscriptions'
      and c.relkind = 'v'
  ) then
    execute 'drop view billing.company_subscriptions';
  end if;
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'billing'
      and c.relname = 'company_subscriptions'
      and c.relkind in ('r','p')
  ) then
    execute 'drop table billing.company_subscriptions cascade';
  end if;
end $$;
create or replace view billing.company_subscriptions as
select
  s.company_id,
  s.plan_id   as plan_code,
  s.status,
  s.current_period_start,
  s.current_period_end,
  s.trial_started_at,
  s.trial_ends_at,
  (s.status = 'trialing' or s.trial_ends_at is not null) as is_trial,
  s.current_period_end as active_until,
  (s.override->>'billing_mode')::text as billing_mode,
  (s.override->>'billing_cycle')::text as billing_cycle,
  s.override,
  s.updated_at
from public.company_subscriptions s;

-- admin.dev_dashboard_kpis() counts from billing.payments if present.
-- Expose public.subscription_payments so the count works.
do $$
begin
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'billing'
      and c.relname = 'payments'
      and c.relkind = 'v'
  ) then
    execute 'drop view billing.payments';
  end if;
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'billing'
      and c.relname = 'payments'
      and c.relkind in ('r','p')
  ) then
    execute 'drop table billing.payments cascade';
  end if;
end $$;
create or replace view billing.payments as
select id, company_id, plan_id, amount, status, billing_mode, created_at, approved_at, rejected_at, reviewed_at, reviewed_by
from public.subscription_payments;

grant usage on schema billing to authenticated;
grant select on billing.company_subscriptions to authenticated;
grant select on billing.payments to authenticated;

-- =============================================================================
-- 2) Extend admin.dev_dashboard_kpis with pending_payments_total
-- =============================================================================

create or replace function admin.dev_dashboard_kpis()
returns table (
  companies_total           bigint,
  users_total               bigint,
  members_total             bigint,
  subscriptions_total       bigint,
  payments_total            bigint,
  pending_payments_total    bigint,
  public_companies_total    bigint,
  public_profiles_total     bigint,
  public_employees_total    bigint
)
language plpgsql
stable
security definer
set search_path = admin, core, billing, public
as $$
begin
  if not admin.is_developer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select count(*) into companies_total from core.companies;
  select count(*) into users_total     from core.profiles;
  select count(*) into members_total   from core.company_members;

  if exists (select 1 from information_schema.tables where table_schema = 'billing' and table_name = 'company_subscriptions') then
    execute 'select count(*) from billing.company_subscriptions' into subscriptions_total;
  else
    subscriptions_total := 0;
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'billing' and table_name = 'payments') then
    execute 'select count(*) from billing.payments' into payments_total;
  elsif exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'subscription_payments') then
    select count(*) into payments_total from public.subscription_payments;
  else
    payments_total := 0;
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'subscription_payments') then
    select count(*) into pending_payments_total from public.subscription_payments where status = 'pending';
  else
    pending_payments_total := 0;
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'companies') then
    execute 'select count(*) from public.companies' into public_companies_total;
  else
    public_companies_total := 0;
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'profiles') then
    execute 'select count(*) from public.profiles' into public_profiles_total;
  else
    public_profiles_total := 0;
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'employees') then
    execute 'select count(*) from public.employees' into public_employees_total;
  else
    public_employees_total := 0;
  end if;

  return next;
end;
$$;

-- =============================================================================
-- 3) public wrappers so supabase.rpc('name') works (client calls public by default)
-- =============================================================================

create or replace function public.dev_dashboard_kpis()
returns table (
  companies_total           bigint,
  users_total               bigint,
  members_total             bigint,
  subscriptions_total       bigint,
  payments_total            bigint,
  pending_payments_total    bigint,
  public_companies_total    bigint,
  public_profiles_total     bigint,
  public_employees_total    bigint
)
language sql
stable
security definer
set search_path = admin, public
as $$
  select * from admin.dev_dashboard_kpis();
$$;

drop function if exists public.dev_list_companies_table();
create or replace function public.dev_list_companies_table()
returns table (
  company_id          uuid,
  company_name        text,
  subscription_status text,
  plan_code           text,
  billing_mode        text,
  billing_cycle       text,
  is_trial            boolean,
  trial_ends_at       timestamptz,
  active_until        timestamptz
)
language sql
stable
security definer
set search_path = admin, public
as $$
  select
    (r->>'company_id')::uuid as company_id,
    (r->>'company_name')::text as company_name,
    (r->>'subscription_status')::text as subscription_status,
    (r->>'plan_code')::text as plan_code,
    (r->>'billing_mode')::text as billing_mode,
    (r->>'billing_cycle')::text as billing_cycle,
    coalesce((r->>'is_trial')::boolean, false) as is_trial,
    nullif(r->>'trial_ends_at','')::timestamptz as trial_ends_at,
    nullif(r->>'active_until','')::timestamptz as active_until
  from jsonb_array_elements(
    coalesce(public.list_companies(null::text, 200::int, 0::int)->'rows', '[]'::jsonb)
  ) r;
$$;

grant execute on function public.dev_dashboard_kpis() to authenticated;
grant execute on function public.dev_list_companies_table() to authenticated;

-- =============================================================================
-- 4) override_subscription RPC (frontend: developerAdminService.overrideSubscription)
-- =============================================================================

create or replace function public.override_subscription(
  _company_id uuid,
  _mode text,
  _days int default null,
  _until timestamptz default null,
  _plan_code text default null,
  _billing_mode text default null,
  _billing_cycle text default null,
  _note text default null,
  _reason text default null
)
returns void
language plpgsql
security definer
set search_path = admin, core, public
as $$
declare
  v_company_id uuid := _company_id;
begin
  if not admin.is_developer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  -- Upsert public.company_subscriptions with override and/or trial/period
  insert into public.company_subscriptions (
    company_id,
    plan_id,
    status,
    trial_started_at,
    trial_ends_at,
    current_period_start,
    current_period_end,
    override,
    updated_at
  )
  values (
    v_company_id,
    coalesce(_plan_code, 'pro'),
    case _mode
      when 'start_trial' then 'trialing'
      when 'free_until' then 'active'
      when 'free_forever' then 'active'
      when 'paid_active' then 'active'
      else 'trialing'
    end,
    case when _mode = 'start_trial' then now() else null end,
    case when _mode = 'start_trial' and _days is not null then now() + (_days || ' days')::interval
         when _mode = 'free_until' and _until is not null then _until
         else (select trial_ends_at from public.company_subscriptions where company_id = v_company_id limit 1)
    end,
    now(),
    coalesce(_until, now() + interval '1 year'),
    jsonb_build_object(
      'enabled', true,
      'mode', _mode,
      'note', _note,
      'reason', _reason,
      'billing_mode', _billing_mode,
      'billing_cycle', _billing_cycle,
      'granted_at', now()
    ),
    now()
  )
  on conflict (company_id) do update set
    plan_id          = coalesce(excluded.plan_id, public.company_subscriptions.plan_id),
    status           = coalesce(excluded.status, public.company_subscriptions.status),
    trial_started_at = coalesce(excluded.trial_started_at, public.company_subscriptions.trial_started_at),
    trial_ends_at    = coalesce(excluded.trial_ends_at, public.company_subscriptions.trial_ends_at),
    current_period_end = coalesce(excluded.current_period_end, public.company_subscriptions.current_period_end),
    override         = public.company_subscriptions.override || coalesce(excluded.override, '{}'::jsonb),
    updated_at       = now();
end;
$$;

grant execute on function public.override_subscription(uuid, text, int, timestamptz, text, text, text, text, text) to authenticated;

-- =============================================================================
-- 5) admin.list_platform_users() + public wrapper (Users page)
-- =============================================================================

-- Supports core.profiles (clerk_user_id) or public.profiles (id) depending on schema
create or replace function admin.list_platform_users()
returns table (
  user_id       text,
  email         text,
  full_name     text,
  company_id    uuid,
  company_name  text,
  role          text,
  created_at    timestamptz
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

  -- Use core.profiles if it has clerk_user_id; else fallback to public.profiles
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'core' and table_name = 'profiles' and column_name = 'clerk_user_id'
  ) then
    return query
    select
      p.clerk_user_id as user_id,
      p.email,
      p.full_name,
      m.company_id,
      c.name as company_name,
      m.role,
      p.created_at
    from core.profiles p
    left join lateral (
      select m.company_id, m.role
      from core.company_members m
      where m.clerk_user_id = p.clerk_user_id
      order by m.created_at desc
      limit 1
    ) m on true
    left join core.companies c on c.id = m.company_id
    where not exists (select 1 from admin.developers d where d.clerk_user_id = p.clerk_user_id)
    order by p.created_at desc nulls last;
  else
    -- Fallback: public.profiles (id as user id) + one membership per user
    return query
    select
      pr.id as user_id,
      pr.email,
      pr.full_name,
      m.company_id as company_id,
      co.name as company_name,
      m.role,
      pr.created_at
    from public.profiles pr
    left join lateral (
      select m.company_id, m.role
      from public.company_members m
      where m.user_id = pr.id
      order by m.created_at desc
      limit 1
    ) m on true
    left join public.companies co on co.id = m.company_id
    where not exists (select 1 from admin.developers d where d.clerk_user_id = pr.id)
    order by pr.created_at desc nulls last;
  end if;
end;
$$;

drop function if exists public.list_platform_users();
create or replace function public.list_platform_users()
returns table (
  user_id       text,
  email         text,
  full_name     text,
  company_id    uuid,
  company_name  text,
  role          text,
  created_at    timestamptz
)
language sql
stable
security definer
set search_path = admin, public
as $$
  select * from admin.list_platform_users();
$$;

grant execute on function admin.list_platform_users() to authenticated;
grant execute on function public.list_platform_users() to authenticated;

-- =============================================================================
-- 6) subscription_payments: ensure developers can UPDATE (approve/reject)
-- =============================================================================

-- RLS already has subscription_payments_update USING (is_developer()) in 20240101000002.
-- If later migrations dropped it, re-add a policy for developers.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'subscription_payments'
      and policyname = 'subscription_payments_developer_update'
  ) then
    create policy subscription_payments_developer_update
      on public.subscription_payments
      for update
      using (admin.is_developer())
      with check (admin.is_developer());
  end if;
end $$;

-- =============================================================================
-- 7) approve_subscription_payment / reject_subscription_payment RPCs
-- =============================================================================

create or replace function public.approve_subscription_payment(_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = admin, public
as $$
begin
  if not admin.is_developer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  update public.subscription_payments
  set
    status = 'approved',
    approved_at = now(),
    reviewed_at = now(),
    reviewed_by = core.current_user_id()
  where id = _payment_id and status = 'pending';
  if not found then
    raise exception 'Payment not found or not pending' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.reject_subscription_payment(_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = admin, public
as $$
begin
  if not admin.is_developer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  update public.subscription_payments
  set
    status = 'rejected',
    rejected_at = now(),
    reviewed_at = now(),
    reviewed_by = core.current_user_id()
  where id = _payment_id and status = 'pending';
  if not found then
    raise exception 'Payment not found or not pending' using errcode = 'P0001';
  end if;
end;
$$;

grant execute on function public.approve_subscription_payment(uuid) to authenticated;
grant execute on function public.reject_subscription_payment(uuid) to authenticated;

-- =============================================================================
-- 8) list_pending_payments (Billing Confirmation page)
-- =============================================================================

drop function if exists admin.list_pending_payments();
create or replace function admin.list_pending_payments()
returns table (
  id            uuid,
  company_id    text,
  company_name  text,
  plan_id       text,
  amount        numeric,
  status        text,
  billing_mode  text,
  created_at    timestamptz
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
    sp.status::text,
    sp.billing_mode,
    sp.created_at
  from public.subscription_payments sp
  left join public.companies c on c.id::text = sp.company_id
  where sp.status = 'pending'
  order by sp.created_at desc;
end;
$$;

drop function if exists public.list_pending_payments();
create or replace function public.list_pending_payments()
returns table (
  id            uuid,
  company_id    text,
  company_name  text,
  plan_id       text,
  amount        numeric,
  status        text,
  billing_mode  text,
  created_at    timestamptz
)
language sql
stable
security definer
set search_path = admin, public
as $$
  select * from admin.list_pending_payments();
$$;

grant execute on function admin.list_pending_payments() to authenticated;
grant execute on function public.list_pending_payments() to authenticated;

-- =============================================================================
-- 9) list_payments with filters and pagination (Billing page)
-- =============================================================================

create or replace function public.list_payments(
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
  id            uuid,
  company_id    text,
  company_name  text,
  plan_id       text,
  amount        numeric,
  status        text,
  billing_mode  text,
  created_at    timestamptz,
  approved_at   timestamptz,
  reviewed_by   text
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
    sp.status::text,
    sp.billing_mode,
    sp.created_at,
    sp.approved_at,
    sp.reviewed_by
  from public.subscription_payments sp
  left join public.companies c on c.id::text = sp.company_id
  where
    (_status = 'all' or sp.status = _status)
    and (_billing_mode is null or sp.billing_mode = _billing_mode)
    and (_plan is null or sp.plan_id = _plan)
    and (_date_from is null or sp.created_at >= _date_from)
    and (_date_to is null or sp.created_at <= _date_to)
    and (_search is null or _search = '' or c.name ilike '%' || _search || '%' or sp.company_id::text ilike '%' || _search || '%')
  order by sp.created_at desc
  limit _limit
  offset _offset;
end;
$$;

grant execute on function public.list_payments(text, text, text, timestamptz, timestamptz, text, int, int) to authenticated;

commit;
