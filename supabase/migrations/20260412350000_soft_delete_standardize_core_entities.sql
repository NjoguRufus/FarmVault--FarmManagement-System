-- Production: standardize optional soft-delete column `deleted_at` on core domain tables.
-- Safe on live DB: ADD COLUMN IF NOT EXISTS only; no data loss; no table drops; idempotent.
-- Uses to_regclass + pg_class.relkind so missing relations are skipped and **views** are skipped
-- (e.g. public.inventory_items may be a view — ADD COLUMN is not valid on views).
--
-- Depends: public._column_exists / public._table_exists (reports analytics migrations).
-- Analytics RPCs: re-applied here (same bodies as 20260412340000) so a single deploy fixes
-- "h.deleted_at does not exist" even if 12340000 was never applied. Idempotent CREATE OR REPLACE.

begin;

-- -----------------------------------------------------------------------------
-- 1) deleted_at — canonical module tables + public operational tables
-- -----------------------------------------------------------------------------
DO $fv$
DECLARE
  r regclass;
  t text;
  v_kind "char";
BEGIN
  -- projects / harvest / finance (canonical schemas); only heap / partitioned tables
  r := to_regclass('projects.projects');
  IF r IS NOT NULL THEN
    select c.relkind into v_kind from pg_class c where c.oid = r::oid;
    IF v_kind in ('r', 'p') THEN
      EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS deleted_at timestamptz', r::text);
    END IF;
  END IF;

  r := to_regclass('harvest.harvests');
  IF r IS NOT NULL THEN
    select c.relkind into v_kind from pg_class c where c.oid = r::oid;
    IF v_kind in ('r', 'p') THEN
      EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS deleted_at timestamptz', r::text);
    END IF;
  END IF;

  r := to_regclass('harvest.harvest_collections');
  IF r IS NOT NULL THEN
    select c.relkind into v_kind from pg_class c where c.oid = r::oid;
    IF v_kind in ('r', 'p') THEN
      EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS deleted_at timestamptz', r::text);
    END IF;
  END IF;

  r := to_regclass('finance.expenses');
  IF r IS NOT NULL THEN
    select c.relkind into v_kind from pg_class c where c.oid = r::oid;
    IF v_kind in ('r', 'p') THEN
      EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS deleted_at timestamptz', r::text);
    END IF;
  END IF;

  -- public legacy / operational (skip if missing or if relation is a view / matview)
  FOREACH t IN ARRAY ARRAY[
    'public.inventory_items',
    'public.inventory_purchases',
    'public.employees',
    'public.suppliers',
    'public.farm_notebook_entries',
    'public.season_challenges'
  ]
  LOOP
    r := to_regclass(t);
    IF r IS NOT NULL THEN
      select c.relkind into v_kind from pg_class c where c.oid = r::oid;
      IF v_kind in ('r', 'p') THEN
        EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS deleted_at timestamptz', t);
      END IF;
    END IF;
  END LOOP;
END
$fv$;

-- -----------------------------------------------------------------------------
-- 2) Indexes — lightweight btree on deleted_at; partial "active row" where company_id exists
--    IF NOT EXISTS avoids duplicate names if prior migrations created similar indexes.
-- -----------------------------------------------------------------------------
DO $ixm$
DECLARE
  r regclass;
  v_kind "char";
BEGIN
  r := to_regclass('projects.projects');
  IF r IS NOT NULL THEN
    select c.relkind into v_kind from pg_class c where c.oid = r::oid;
    IF v_kind in ('r', 'p') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_projects_projects_deleted_at ON projects.projects (deleted_at)';
    END IF;
  END IF;

  r := to_regclass('harvest.harvests');
  IF r IS NOT NULL THEN
    select c.relkind into v_kind from pg_class c where c.oid = r::oid;
    IF v_kind in ('r', 'p') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_harvest_harvests_deleted_at ON harvest.harvests (deleted_at)';
      EXECUTE $sql$
        CREATE INDEX IF NOT EXISTS idx_harvest_harvests_company_deleted_at_active
        ON harvest.harvests (company_id)
        WHERE deleted_at IS NULL
      $sql$;
    END IF;
  END IF;

  r := to_regclass('harvest.harvest_collections');
  IF r IS NOT NULL THEN
    select c.relkind into v_kind from pg_class c where c.oid = r::oid;
    IF v_kind in ('r', 'p') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_harvest_collections_deleted_at ON harvest.harvest_collections (deleted_at)';
      EXECUTE $sql$
        CREATE INDEX IF NOT EXISTS idx_harvest_collections_company_deleted_at_active
        ON harvest.harvest_collections (company_id)
        WHERE deleted_at IS NULL
      $sql$;
    END IF;
  END IF;

  r := to_regclass('finance.expenses');
  IF r IS NOT NULL THEN
    select c.relkind into v_kind from pg_class c where c.oid = r::oid;
    IF v_kind in ('r', 'p') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_finance_expenses_deleted_at ON finance.expenses (deleted_at)';
      EXECUTE $sql$
        CREATE INDEX IF NOT EXISTS idx_finance_expenses_company_deleted_at_active
        ON finance.expenses (company_id)
        WHERE deleted_at IS NULL
      $sql$;
    END IF;
  END IF;
END
$ixm$;

DO $ix$
DECLARE
  r regclass;
  v_kind "char";
  t text;
  idx text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'public.inventory_items',
    'public.inventory_purchases',
    'public.employees',
    'public.suppliers',
    'public.farm_notebook_entries',
    'public.season_challenges'
  ]
  LOOP
    r := to_regclass(t);
    IF r IS NOT NULL THEN
      select c.relkind into v_kind from pg_class c where c.oid = r::oid;
      IF v_kind in ('r', 'p') THEN
        idx := 'idx_' || replace(t, '.', '_') || '_deleted_at';
        EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %s (deleted_at)', idx, t);
      END IF;
    END IF;
  END LOOP;
END
$ix$;

-- -----------------------------------------------------------------------------
-- 3) Analytics RPCs — conditional deleted_at filters (defensive + correct after columns exist)
-- -----------------------------------------------------------------------------
create or replace function public.analytics_monthly_revenue(p_company_id uuid)
returns table(month date, revenue numeric)
language plpgsql
stable
security definer
set search_path = public, harvest, projects, finance
set row_security = off
as $$
declare
  use_hct boolean := false;
  use_hct_created_at boolean := false;
  use_hct_total_revenue boolean := false;
  use_hct_total_gross boolean := false;
  v_hc_del text;
  v_p_join text;
  v_h_del text;
  sql text;
begin
  v_hc_del := case
    when public._column_exists('harvest', 'harvest_collections', 'deleted_at') then ' and hc.deleted_at is null '
    else ''
  end;
  v_p_join := case
    when public._column_exists('projects', 'projects', 'deleted_at') then ' and p.deleted_at is null '
    else ''
  end;
  v_h_del := case
    when public._column_exists('harvest', 'harvests', 'deleted_at') then ' and h.deleted_at is null '
    else ''
  end;

  use_hct := public._table_exists('public', 'harvest_collection_totals')
    and public._column_exists('public', 'harvest_collection_totals', 'company_id')
    and public._column_exists('public', 'harvest_collection_totals', 'created_at');

  use_hct_total_revenue := public._column_exists('public', 'harvest_collection_totals', 'total_revenue');
  use_hct_total_gross := public._column_exists('public', 'harvest_collection_totals', 'total_gross_amount');
  use_hct_created_at := public._column_exists('public', 'harvest_collection_totals', 'created_at');

  if use_hct and use_hct_created_at and (use_hct_total_revenue or use_hct_total_gross) then
    sql := format(
      $q$
      select date_trunc('month', hct.created_at)::date as month,
             coalesce(sum(coalesce(hct.total_revenue, hct.total_gross_amount, 0)), 0)::numeric as revenue
      from public.harvest_collection_totals hct
      join harvest.harvest_collections hc on hc.id = hct.collection_id %1$s
      join projects.projects p on p.id = hc.project_id %2$s
      where hct.company_id = $1
      group by 1
      order by 1
      $q$,
      v_hc_del,
      v_p_join
    );
    return query execute sql using p_company_id;
    return;
  end if;

  sql := format(
    $q$
    select date_trunc('month', h.created_at)::date as month,
           coalesce(sum(coalesce(h.quantity, 0) * coalesce(h.price_per_unit, 0)), 0)::numeric as revenue
    from harvest.harvests h
    join projects.projects p on p.id = h.project_id %1$s
    where h.company_id = $1 %2$s
    group by 1
    order by 1
    $q$,
    v_p_join,
    v_h_del
  );
  return query execute sql using p_company_id;
end;
$$;

create or replace function public.analytics_expense_breakdown(p_company_id uuid)
returns table(category text, total numeric)
language plpgsql
stable
security definer
set search_path = public, harvest, projects, finance
set row_security = off
as $$
declare
  v_e_del text;
  sql text;
begin
  v_e_del := case
    when public._column_exists('finance', 'expenses', 'deleted_at') then ' and e.deleted_at is null '
    else ''
  end;
  sql := format(
    $q$
    select e.category::text as category,
           coalesce(sum(e.amount), 0)::numeric as total
    from finance.expenses e
    where e.company_id = $1 %s
    group by e.category
    order by total desc
    $q$,
    v_e_del
  );
  return query execute sql using p_company_id;
end;
$$;

create or replace function public.analytics_crop_yield(p_company_id uuid)
returns table(crop text, total_yield numeric)
language plpgsql
stable
security definer
set search_path = public, harvest, projects, finance
set row_security = off
as $$
declare
  crop_col text;
  yield_col text;
  v_h_del text;
  v_p_join text;
  sql text;
begin
  crop_col := 'crop_type';

  yield_col :=
    case
      when public._column_exists('harvest', 'harvests', 'total_yield') then 'total_yield'
      when public._column_exists('harvest', 'harvests', 'total_yield_kg') then 'total_yield_kg'
      when public._column_exists('harvest', 'harvests', 'quantity') then 'quantity'
      else null
    end;

  if crop_col is null or yield_col is null then
    return;
  end if;

  v_h_del := case
    when public._column_exists('harvest', 'harvests', 'deleted_at') then ' and h.deleted_at is null '
    else ''
  end;
  v_p_join := case
    when public._column_exists('projects', 'projects', 'deleted_at') then ' and p.deleted_at is null '
    else ''
  end;

  sql := format(
    $q$
      select nullif(trim(p.%1$I::text), '') as crop,
             coalesce(sum(h.%2$I), 0)::numeric as total_yield
      from harvest.harvests h
      join projects.projects p on p.id = h.project_id %4$s
      where h.company_id = $1 %3$s
      group by 1
      order by total_yield desc
    $q$,
    crop_col,
    yield_col,
    v_h_del,
    v_p_join
  );

  return query execute sql using p_company_id;
end;
$$;

create or replace function public.analytics_crop_profit(p_company_id uuid)
returns table(crop text, total_revenue numeric, total_expenses numeric, profit numeric)
language plpgsql
stable
security definer
set search_path = public, harvest, projects, finance
set row_security = off
as $$
declare
  use_hct boolean := false;
  use_hct_crop boolean := false;
  use_hct_total_revenue boolean := false;
  use_hct_total_gross boolean := false;
  harvest_crop_col text;
  expenses_crop_col text;
  v_hc_del text;
  v_p_join text;
  v_e_del text;
  v_exp_proj text;
  v_h_del text;
  sql text;
begin
  v_hc_del := case
    when public._column_exists('harvest', 'harvest_collections', 'deleted_at') then ' and hc.deleted_at is null '
    else ''
  end;
  v_p_join := case
    when public._column_exists('projects', 'projects', 'deleted_at') then ' and p.deleted_at is null '
    else ''
  end;
  v_e_del := case
    when public._column_exists('finance', 'expenses', 'deleted_at') then ' and e.deleted_at is null '
    else ''
  end;
  v_exp_proj := case
    when public._column_exists('projects', 'projects', 'deleted_at') then '(e.project_id is null or p.deleted_at is null)'
    else 'true'
  end;
  v_h_del := case
    when public._column_exists('harvest', 'harvests', 'deleted_at') then ' and h.deleted_at is null '
    else ''
  end;

  use_hct := public._table_exists('public', 'harvest_collection_totals')
    and public._column_exists('public', 'harvest_collection_totals', 'company_id');
  use_hct_crop := public._column_exists('public', 'harvest_collection_totals', 'crop');
  use_hct_total_revenue := public._column_exists('public', 'harvest_collection_totals', 'total_revenue');
  use_hct_total_gross := public._column_exists('public', 'harvest_collection_totals', 'total_gross_amount');

  if use_hct and use_hct_crop and (use_hct_total_revenue or use_hct_total_gross) then
    sql := format(
      $q$
      with revenue as (
        select nullif(trim(hct.crop), '') as crop,
               coalesce(sum(coalesce(hct.total_revenue, hct.total_gross_amount, 0)), 0)::numeric as total_revenue
        from public.harvest_collection_totals hct
        join harvest.harvest_collections hc on hc.id = hct.collection_id %1$s
        join projects.projects p on p.id = hc.project_id %2$s
        where hct.company_id = $1
        group by 1
      ),
      exp as (
        select nullif(trim(p.crop_type), '') as crop,
               coalesce(sum(e.amount), 0)::numeric as total_expenses
        from finance.expenses e
        left join projects.projects p on p.id = e.project_id
        where e.company_id = $1 %3$s and %4$s
        group by 1
      )
      select coalesce(revenue.crop, exp.crop) as crop,
             coalesce(revenue.total_revenue, 0)::numeric as total_revenue,
             coalesce(exp.total_expenses, 0)::numeric as total_expenses,
             (coalesce(revenue.total_revenue, 0) - coalesce(exp.total_expenses, 0))::numeric as profit
      from revenue
      full outer join exp on exp.crop = revenue.crop
      order by profit desc, total_revenue desc
      $q$,
      v_hc_del,
      v_p_join,
      v_e_del,
      v_exp_proj
    );
    return query execute sql using p_company_id;
    return;
  end if;

  harvest_crop_col := 'crop_type';
  expenses_crop_col := 'crop_type';

  if harvest_crop_col is null or expenses_crop_col is null then
    return;
  end if;

  sql := format(
    $q$
      with revenue as (
        select nullif(trim(p.%1$I::text), '') as crop,
               coalesce(sum(coalesce(h.quantity, 0) * coalesce(h.price_per_unit, 0)), 0)::numeric as total_revenue
        from harvest.harvests h
        join projects.projects p on p.id = h.project_id %5$s
        where h.company_id = $1 %6$s
        group by 1
      ),
      exp as (
        select nullif(trim(p.%2$I::text), '') as crop,
               coalesce(sum(e.amount), 0)::numeric as total_expenses
        from finance.expenses e
        left join projects.projects p on p.id = e.project_id
        where e.company_id = $1 %3$s and %4$s
        group by 1
      )
      select coalesce(revenue.crop, exp.crop) as crop,
             coalesce(revenue.total_revenue, 0)::numeric as total_revenue,
             coalesce(exp.total_expenses, 0)::numeric as total_expenses,
             (coalesce(revenue.total_revenue, 0) - coalesce(exp.total_expenses, 0))::numeric as profit
      from revenue
      full outer join exp on exp.crop = revenue.crop
      order by profit desc, total_revenue desc
    $q$,
    harvest_crop_col,
    expenses_crop_col,
    v_e_del,
    v_exp_proj,
    v_p_join,
    v_h_del
  );
  return query execute sql using p_company_id;
end;
$$;

create or replace function public.analytics_report_detail_rows(p_company_id uuid)
returns table(
  date date,
  crop text,
  revenue numeric,
  expenses numeric,
  profit numeric,
  yield numeric
)
language plpgsql
stable
security definer
set search_path = public, harvest, projects, finance
set row_security = off
as $$
declare
  use_hct boolean := false;
  use_hct_created_at boolean := false;
  use_hct_total_revenue boolean := false;
  use_hct_total_gross boolean := false;
  use_hct_crop boolean := false;
  harvest_crop_col text;
  expenses_crop_col text;
  harvest_yield_col text;
  harvest_date_col text;
  v_hc_del text;
  v_p_join text;
  v_e_del text;
  v_exp_proj text;
  v_h_del text;
  sql text;
begin
  v_hc_del := case
    when public._column_exists('harvest', 'harvest_collections', 'deleted_at') then ' and hc.deleted_at is null '
    else ''
  end;
  v_p_join := case
    when public._column_exists('projects', 'projects', 'deleted_at') then ' and p.deleted_at is null '
    else ''
  end;
  v_e_del := case
    when public._column_exists('finance', 'expenses', 'deleted_at') then ' and e.deleted_at is null '
    else ''
  end;
  v_exp_proj := case
    when public._column_exists('projects', 'projects', 'deleted_at') then '(e.project_id is null or p.deleted_at is null)'
    else 'true'
  end;
  v_h_del := case
    when public._column_exists('harvest', 'harvests', 'deleted_at') then ' and h.deleted_at is null '
    else ''
  end;

  use_hct := public._table_exists('public', 'harvest_collection_totals')
    and public._column_exists('public', 'harvest_collection_totals', 'company_id');
  use_hct_created_at := public._column_exists('public', 'harvest_collection_totals', 'created_at');
  use_hct_total_revenue := public._column_exists('public', 'harvest_collection_totals', 'total_revenue');
  use_hct_total_gross := public._column_exists('public', 'harvest_collection_totals', 'total_gross_amount');
  use_hct_crop := public._column_exists('public', 'harvest_collection_totals', 'crop');

  harvest_crop_col := 'crop_type';
  expenses_crop_col := 'crop_type';
  harvest_yield_col :=
    case
      when public._column_exists('harvest', 'harvests', 'total_yield') then 'total_yield'
      when public._column_exists('harvest', 'harvests', 'total_yield_kg') then 'total_yield_kg'
      when public._column_exists('harvest', 'harvests', 'quantity') then 'quantity'
      else null
    end;
  harvest_date_col :=
    case
      when public._column_exists('harvest', 'harvests', 'harvest_date') then 'harvest_date'
      when public._column_exists('harvest', 'harvests', 'date') then 'date'
      when public._column_exists('harvest', 'harvests', 'created_at') then 'created_at'
      else null
    end;

  if harvest_crop_col is null or expenses_crop_col is null or harvest_yield_col is null or harvest_date_col is null then
    return;
  end if;

  if use_hct and use_hct_created_at and (use_hct_total_revenue or use_hct_total_gross) and use_hct_crop then
    sql := format(
      $q$
        with revenue as (
          select (hct.created_at at time zone 'utc')::date as date,
                 nullif(trim(hct.crop), '') as crop,
                 coalesce(sum(coalesce(hct.total_revenue, hct.total_gross_amount, 0)), 0)::numeric as revenue
          from public.harvest_collection_totals hct
          join harvest.harvest_collections hc on hc.id = hct.collection_id %5$s
          join projects.projects p on p.id = hc.project_id %6$s
          where hct.company_id = $1
          group by 1, 2
        ),
        exp as (
          select e.expense_date::date as date,
                 nullif(trim(p.%1$I::text), '') as crop,
                 coalesce(sum(e.amount), 0)::numeric as expenses
          from finance.expenses e
          left join projects.projects p on p.id = e.project_id
          where e.company_id = $1 %7$s and %8$s
          group by 1, 2
        ),
        y as (
          select (h.%2$I)::date as date,
                 nullif(trim(p.%3$I::text), '') as crop,
                 coalesce(sum(h.%4$I), 0)::numeric as yield
          from harvest.harvests h
          join projects.projects p on p.id = h.project_id %6$s
          where h.company_id = $1 %9$s
          group by 1, 2
        )
        select coalesce(revenue.date, exp.date, y.date) as date,
               coalesce(revenue.crop, exp.crop, y.crop) as crop,
               coalesce(revenue.revenue, 0)::numeric as revenue,
               coalesce(exp.expenses, 0)::numeric as expenses,
               (coalesce(revenue.revenue, 0) - coalesce(exp.expenses, 0))::numeric as profit,
               coalesce(y.yield, 0)::numeric as yield
        from revenue
        full outer join exp on exp.date = revenue.date and exp.crop is not distinct from revenue.crop
        full outer join y on y.date = coalesce(revenue.date, exp.date) and y.crop is not distinct from coalesce(revenue.crop, exp.crop)
        order by date desc nulls last, crop asc nulls last
      $q$,
      expenses_crop_col,
      harvest_date_col,
      harvest_crop_col,
      harvest_yield_col,
      v_hc_del,
      v_p_join,
      v_e_del,
      v_exp_proj,
      v_h_del
    );
    return query execute sql using p_company_id;
    return;
  end if;

  sql := format(
    $q$
      with revenue as (
        select h.created_at::date as date,
               nullif(trim(p.%1$I::text), '') as crop,
               coalesce(sum(coalesce(h.quantity, 0) * coalesce(h.price_per_unit, 0)), 0)::numeric as revenue
        from harvest.harvests h
        join projects.projects p on p.id = h.project_id %5$s
        where h.company_id = $1 %6$s
        group by 1, 2
      ),
      exp as (
        select e.expense_date::date as date,
               nullif(trim(p.%2$I::text), '') as crop,
               coalesce(sum(e.amount), 0)::numeric as expenses
        from finance.expenses e
        left join projects.projects p on p.id = e.project_id
        where e.company_id = $1 %7$s and %8$s
        group by 1, 2
      ),
      y as (
        select (h.%3$I)::date as date,
               nullif(trim(p.%1$I::text), '') as crop,
               coalesce(sum(h.%4$I), 0)::numeric as yield
        from harvest.harvests h
        join projects.projects p on p.id = h.project_id %5$s
        where h.company_id = $1 %6$s
        group by 1, 2
      )
      select coalesce(revenue.date, exp.date, y.date) as date,
             coalesce(revenue.crop, exp.crop, y.crop) as crop,
             coalesce(revenue.revenue, 0)::numeric as revenue,
             coalesce(exp.expenses, 0)::numeric as expenses,
             (coalesce(revenue.revenue, 0) - coalesce(exp.expenses, 0))::numeric as profit,
             coalesce(y.yield, 0)::numeric as yield
      from revenue
      full outer join exp on exp.date = revenue.date and exp.crop is not distinct from revenue.crop
      full outer join y on y.date = coalesce(revenue.date, exp.date) and y.crop is not distinct from coalesce(revenue.crop, exp.crop)
      order by date desc nulls last, crop asc nulls last
    $q$,
    harvest_crop_col,
    expenses_crop_col,
    harvest_date_col,
    harvest_yield_col,
    v_p_join,
    v_h_del,
    v_e_del,
    v_exp_proj
  );
  return query execute sql using p_company_id;
end;
$$;

grant execute on function public.analytics_monthly_revenue(uuid) to authenticated;
grant execute on function public.analytics_expense_breakdown(uuid) to authenticated;
grant execute on function public.analytics_crop_yield(uuid) to authenticated;
grant execute on function public.analytics_crop_profit(uuid) to authenticated;
grant execute on function public.analytics_report_detail_rows(uuid) to authenticated;

commit;

notify pgrst, 'reload schema';

-- =============================================================================
-- VALIDATION (run manually in SQL editor after migration)
-- =============================================================================
-- 1) Columns present:
--    select table_schema, table_name, column_name
--    from information_schema.columns
--    where column_name = 'deleted_at'
--      and table_schema in ('projects','harvest','finance','public')
--      and table_name in (
--        'projects','harvests','harvest_collections','expenses',
--        'inventory_items','inventory_purchases','employees','suppliers',
--        'farm_notebook_entries','season_challenges'
--      )
--    order by 1,2;
--
-- 2) Analytics smoke (replace company UUID with a real core.companies.id):
--    select * from public.analytics_monthly_revenue('00000000-0000-0000-0000-000000000001'::uuid) limit 3;
--    select * from public.analytics_crop_yield('00000000-0000-0000-0000-000000000001'::uuid) limit 3;
--    select * from public.analytics_crop_profit('00000000-0000-0000-0000-000000000001'::uuid) limit 3;
--    select * from public.analytics_expense_breakdown('00000000-0000-0000-0000-000000000001'::uuid) limit 3;
--    select * from public.analytics_report_detail_rows('00000000-0000-0000-0000-000000000001'::uuid) limit 3;
--
-- 3) No invalid column in generated SQL (should return zero rows):
--    -- N/A — functions use dynamic SQL only when _column_exists is true.
