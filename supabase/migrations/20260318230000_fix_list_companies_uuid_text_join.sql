-- Fix list_companies: operator does not exist uuid = text
-- public.company_subscriptions.company_id can be TEXT (legacy) or UUID; core.companies.id is UUID.
-- Use explicit cast so the join works: s.company_id::text = c.id::text
-- Uses legacy schema (plan_id, override) - matches 20260318200000. If 20260318210000 ran and
-- added plan_code/billing_mode columns, they are ignored here for compatibility.

begin;

drop function if exists public.list_companies(text, int, int);

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
begin
  if not admin.is_developer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  -- Get total count
  select count(*) into v_total
  from core.companies c
  where (p_search is null or p_search = '' or c.name ilike '%' || p_search || '%');

  -- Build result - cast both sides to text for join (handles company_subscriptions.company_id as uuid or text)
  select jsonb_build_object(
    'rows', coalesce(jsonb_agg(row_data order by (row_data->>'created_at')::timestamptz desc nulls last), '[]'::jsonb),
    'total', v_total
  )
  into v_result
  from (
    select jsonb_build_object(
      'company_id', c.id,
      'company_name', c.name,
      'created_at', c.created_at,
      'users_count', (
        select count(*) 
        from core.company_members cm 
        where cm.company_id = c.id
      ),
      'employees_count', (
        select count(*) 
        from public.employees e 
        where e.company_id = c.id::text
      ),
      'subscription_status', coalesce(s.status, 'none'),
      'plan_code', coalesce(s.plan_id, 'basic'),
      'billing_mode', s.override->>'billing_mode',
      'billing_cycle', s.override->>'billing_cycle',
      'is_trial', s.status = 'trialing',
      'trial_ends_at', s.trial_ends_at,
      'active_until', s.current_period_end,
      'override_reason', s.override->>'reason',
      'override_by', s.override->>'granted_by',
      'override', s.override,
      'subscription', jsonb_build_object(
        'plan', s.plan_id,
        'plan_code', coalesce(s.plan_id, 'basic'),
        'status', s.status,
        'is_trial', s.status = 'trialing',
        'trial_start', s.trial_started_at,
        'trial_end', s.trial_ends_at,
        'active_until', s.current_period_end,
        'billing_mode', s.override->>'billing_mode',
        'billing_cycle', s.override->>'billing_cycle'
      )
    ) as row_data
    from core.companies c
    left join public.company_subscriptions s on s.company_id::text = c.id::text
    where (p_search is null or p_search = '' or c.name ilike '%' || p_search || '%')
    order by c.created_at desc nulls last
    limit p_limit
    offset p_offset
  ) subq;

  return coalesce(v_result, '{"rows": [], "total": 0}'::jsonb);
end;
$$;

grant execute on function public.list_companies(text, int, int) to authenticated;

-- =============================================================================
-- Fix admin.list_companies_for_migration: uuid = text in employees, company_members, etc.
-- public.companies.id is UUID; employees.company_id, inventory_items.company_id, suppliers.company_id are TEXT.
-- =============================================================================

create or replace function admin.list_companies_for_migration()
returns table(
  company_id text,
  company_name text,
  created_at timestamptz,
  admin_user_id text,
  admin_email text,
  admin_full_name text,
  has_migrated_data boolean,
  migration_count bigint,
  is_new boolean,
  record_counts jsonb
)
language plpgsql security definer as $$
declare
  new_threshold interval := interval '7 days';
  is_service_role boolean;
begin
  is_service_role := (select current_user = 'postgres' or current_setting('role', true) = 'service_role');
  if not is_service_role and not admin.is_developer() then
    raise exception 'Access denied: developer only';
  end if;

  return query
  select
    c.id::text as company_id,
    c.name as company_name,
    c.created_at,
    cm.user_id as admin_user_id,
    coalesce(p.email, '')::text as admin_email,
    coalesce(p.full_name, '')::text as admin_full_name,
    exists(
      select 1 from admin.company_migrations m
      where m.target_company_id::text = c.id::text and m.status = 'completed'
    ) as has_migrated_data,
    (
      select count(*) from admin.company_migrations m
      where m.target_company_id::text = c.id::text and m.status = 'completed'
    ) as migration_count,
    (
      c.created_at > (now() - new_threshold)
      and not exists(
        select 1 from admin.company_migrations m
        where m.target_company_id::text = c.id::text and m.status = 'completed'
      )
    ) as is_new,
    jsonb_build_object(
      'employees', (select count(*) from public.employees e where e.company_id = c.id::text),
      'projects', coalesce((
        select count(*) from projects.projects pr
        where pr.company_id = c.id
      ), 0),
      'expenses', coalesce((
        select count(*) from finance.expenses ex
        where ex.company_id = c.id
      ), 0),
      'harvests', coalesce((
        select count(*) from harvest.harvests h
        where h.company_id = c.id
      ), 0),
      'harvest_collections', coalesce((
        select count(*) from harvest.harvest_collections hc
        where hc.company_id = c.id
      ), 0),
      'inventory_items', (select count(*) from public.inventory_items ii where ii.company_id = c.id::text),
      'suppliers', (select count(*) from public.suppliers s where s.company_id = c.id::text)
    ) as record_counts
  from public.companies c
  left join public.company_members cm
    on cm.company_id::text = c.id::text
    and cm.role in ('company-admin', 'company_admin')
  left join public.profiles p
    on p.id = cm.user_id
  order by c.created_at desc;
end;
$$;

-- Ensure public wrapper delegates to fixed admin function
create or replace function public.list_companies_for_migration()
returns table(
  company_id text,
  company_name text,
  created_at timestamptz,
  admin_user_id text,
  admin_email text,
  admin_full_name text,
  has_migrated_data boolean,
  migration_count bigint,
  is_new boolean,
  record_counts jsonb
)
language plpgsql security definer as $$
begin
  return query select * from admin.list_companies_for_migration();
end;
$$;

grant execute on function public.list_companies_for_migration() to authenticated;

commit;
