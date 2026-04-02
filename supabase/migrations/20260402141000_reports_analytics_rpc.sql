-- Reports & Analytics RPCs (farm data)
-- Provides server-side aggregates for the Reports dashboard.

begin;

-- =========================================================
-- Helpers (dynamic source selection)
-- =========================================================

create or replace function public._table_exists(p_schema text, p_table text)
returns boolean
language sql
stable
as $$
  select to_regclass(format('%I.%I', p_schema, p_table)) is not null;
$$;

create or replace function public._column_exists(p_schema text, p_table text, p_column text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from information_schema.columns
    where table_schema = p_schema
      and table_name = p_table
      and column_name = p_column
  );
$$;

-- =========================================================
-- 1) Monthly Revenue
-- Revenue → harvest_collection_totals.total_revenue (fallback: harvests.farm_total_price)
-- =========================================================

-- NOTE: We standardize RPC param type to uuid to avoid PostgREST overload ambiguity (PGRST203).
drop function if exists public.analytics_monthly_revenue(p_company_id text);
create or replace function public.analytics_monthly_revenue(p_company_id uuid)
returns table(month date, revenue numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  use_hct boolean := false;
  use_hct_created_at boolean := false;
  use_hct_total_revenue boolean := false;
  use_hct_total_gross boolean := false;
begin
  use_hct := public._table_exists('public', 'harvest_collection_totals')
    and public._column_exists('public', 'harvest_collection_totals', 'company_id')
    and public._column_exists('public', 'harvest_collection_totals', 'created_at');

  use_hct_total_revenue := public._column_exists('public', 'harvest_collection_totals', 'total_revenue');
  use_hct_total_gross := public._column_exists('public', 'harvest_collection_totals', 'total_gross_amount');
  use_hct_created_at := public._column_exists('public', 'harvest_collection_totals', 'created_at');

  if use_hct and use_hct_created_at and (use_hct_total_revenue or use_hct_total_gross) then
    return query
      select date_trunc('month', hct.created_at)::date as month,
             coalesce(sum(coalesce(hct.total_revenue, hct.total_gross_amount, 0)), 0)::numeric as revenue
      from public.harvest_collection_totals hct
      where hct.company_id = p_company_id
      group by 1
      order by 1;
    return;
  end if;

  -- Fallback: compute revenue from harvest.harvests using quantity * price_per_unit.
  return query
    select date_trunc('month', h.created_at)::date as month,
           coalesce(sum(coalesce(h.quantity, 0) * coalesce(h.price_per_unit, 0)), 0)::numeric as revenue
    from harvest.harvests h
    where h.company_id = p_company_id
    group by 1
    order by 1;
end;
$$;

-- =========================================================
-- 2) Expense Breakdown
-- Expenses → finance.expenses.amount
-- =========================================================

-- Standardize to uuid to avoid PostgREST overload ambiguity (PGRST203).
drop function if exists public.analytics_expense_breakdown(p_company_id text);
create or replace function public.analytics_expense_breakdown(p_company_id uuid)
returns table(category text, total numeric)
language sql
stable
security definer
set search_path = public
as $$
  select e.category::text as category,
         coalesce(sum(e.amount), 0)::numeric as total
  from finance.expenses e
  where e.company_id = p_company_id
  group by e.category
  order by total desc;
$$;

-- =========================================================
-- 3) Yield Per Crop
-- Yield → harvests.total_yield (fallback: harvests.quantity)
-- =========================================================

drop function if exists public.analytics_crop_yield(p_company_id text);
create or replace function public.analytics_crop_yield(p_company_id uuid)
returns table(crop text, total_yield numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  crop_col text;
  yield_col text;
  sql text;
begin
  -- harvest.harvests doesn't store crop; infer from projects.projects.crop_type
  crop_col := 'crop_type';

  yield_col :=
    case
      when public._column_exists('harvest','harvests','total_yield') then 'total_yield'
      when public._column_exists('harvest','harvests','total_yield_kg') then 'total_yield_kg'
      when public._column_exists('harvest','harvests','quantity') then 'quantity'
      else null
    end;

  if crop_col is null or yield_col is null then
    return;
  end if;

  sql := format(
    $q$
      select nullif(trim(p.%1$I::text), '') as crop,
             coalesce(sum(h.%2$I), 0)::numeric as total_yield
      from harvest.harvests h
      join projects.projects p on p.id = h.project_id
      where h.company_id = $1
      group by 1
      order by total_yield desc
    $q$,
    crop_col,
    yield_col
  );

  return query execute sql using p_company_id;
end;
$$;

-- =========================================================
-- 4) Crop Profit (Revenue - Expenses) + Best Crop inputs
-- Best crop = crop with highest revenue
-- Revenue by crop → harvest_collection_totals (preferred) else harvests.farm_total_price
-- Expenses by crop → expenses.amount grouped by crop_type
-- =========================================================

drop function if exists public.analytics_crop_profit(p_company_id text);
create or replace function public.analytics_crop_profit(p_company_id uuid)
returns table(crop text, total_revenue numeric, total_expenses numeric, profit numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  use_hct boolean := false;
  use_hct_crop boolean := false;
  use_hct_total_revenue boolean := false;
  use_hct_total_gross boolean := false;
  harvest_crop_col text;
  expenses_crop_col text;
begin
  use_hct := public._table_exists('public', 'harvest_collection_totals')
    and public._column_exists('public', 'harvest_collection_totals', 'company_id');
  use_hct_crop := public._column_exists('public', 'harvest_collection_totals', 'crop');
  use_hct_total_revenue := public._column_exists('public', 'harvest_collection_totals', 'total_revenue');
  use_hct_total_gross := public._column_exists('public', 'harvest_collection_totals', 'total_gross_amount');

  if use_hct and use_hct_crop and (use_hct_total_revenue or use_hct_total_gross) then
    return query
      with revenue as (
        select nullif(trim(hct.crop), '') as crop,
               coalesce(sum(coalesce(hct.total_revenue, hct.total_gross_amount, 0)), 0)::numeric as total_revenue
        from public.harvest_collection_totals hct
        where hct.company_id = p_company_id
        group by 1
      ),
      exp as (
        select nullif(trim(p.crop_type), '') as crop,
               coalesce(sum(e.amount), 0)::numeric as total_expenses
        from finance.expenses e
        left join projects.projects p on p.id = e.project_id
        where e.company_id = p_company_id
        group by 1
      )
      select coalesce(revenue.crop, exp.crop) as crop,
             coalesce(revenue.total_revenue, 0)::numeric as total_revenue,
             coalesce(exp.total_expenses, 0)::numeric as total_expenses,
             (coalesce(revenue.total_revenue, 0) - coalesce(exp.total_expenses, 0))::numeric as profit
      from revenue
      full outer join exp on exp.crop = revenue.crop
      order by profit desc, total_revenue desc;
    return;
  end if;

  -- Fallback: revenue from harvest.harvests using quantity * price_per_unit grouped by projects.projects.crop_type
  harvest_crop_col := 'crop_type';
  expenses_crop_col := 'crop_type';

  if harvest_crop_col is null or expenses_crop_col is null then
    return;
  end if;

  return query execute format(
    $q$
      with revenue as (
        select nullif(trim(p.%1$I::text), '') as crop,
               coalesce(sum(coalesce(h.quantity, 0) * coalesce(h.price_per_unit, 0)), 0)::numeric as total_revenue
        from harvest.harvests h
        join projects.projects p on p.id = h.project_id
        where h.company_id = $1
        group by 1
      ),
      exp as (
        select nullif(trim(p.%2$I::text), '') as crop,
               coalesce(sum(e.amount), 0)::numeric as total_expenses
        from finance.expenses e
        left join projects.projects p on p.id = e.project_id
        where e.company_id = $1
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
    expenses_crop_col
  ) using p_company_id;
end;
$$;

commit;

