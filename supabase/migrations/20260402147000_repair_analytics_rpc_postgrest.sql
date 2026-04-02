-- Repair: databases that already ran the OLD 20260402146000 (legacy public.* + text overloads)
-- never got the uuid RPCs back. This migration is idempotent with the fixed 460.

begin;

drop function if exists public.analytics_expense_breakdown(p_company_id text);
drop function if exists public.analytics_monthly_revenue(p_company_id text);
drop function if exists public.analytics_crop_yield(p_company_id text);
drop function if exists public.analytics_crop_profit(p_company_id text);
drop function if exists public.analytics_report_detail_rows(p_company_id text);

create or replace function public.analytics_monthly_revenue(p_company_id uuid)
returns table(month date, revenue numeric)
language plpgsql
stable
security definer
set search_path = public
set row_security = off
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

  return query
    select date_trunc('month', h.created_at)::date as month,
           coalesce(sum(coalesce(h.quantity, 0) * coalesce(h.price_per_unit, 0)), 0)::numeric as revenue
    from harvest.harvests h
    where h.company_id = p_company_id
    group by 1
    order by 1;
end;
$$;

create or replace function public.analytics_expense_breakdown(p_company_id uuid)
returns table(category text, total numeric)
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select e.category::text as category,
         coalesce(sum(e.amount), 0)::numeric as total
  from finance.expenses e
  where e.company_id = p_company_id
  group by e.category
  order by total desc;
$$;

create or replace function public.analytics_crop_yield(p_company_id uuid)
returns table(crop text, total_yield numeric)
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  crop_col text;
  yield_col text;
  sql text;
begin
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

create or replace function public.analytics_crop_profit(p_company_id uuid)
returns table(crop text, total_revenue numeric, total_expenses numeric, profit numeric)
language plpgsql
stable
security definer
set search_path = public
set row_security = off
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
set search_path = public
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
begin
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
      when public._column_exists('harvest','harvests','total_yield') then 'total_yield'
      when public._column_exists('harvest','harvests','total_yield_kg') then 'total_yield_kg'
      when public._column_exists('harvest','harvests','quantity') then 'quantity'
      else null
    end;
  harvest_date_col :=
    case
      when public._column_exists('harvest','harvests','harvest_date') then 'harvest_date'
      when public._column_exists('harvest','harvests','date') then 'date'
      when public._column_exists('harvest','harvests','created_at') then 'created_at'
      else null
    end;

  if harvest_crop_col is null or expenses_crop_col is null or harvest_yield_col is null or harvest_date_col is null then
    return;
  end if;

  if use_hct and use_hct_created_at and (use_hct_total_revenue or use_hct_total_gross) and use_hct_crop then
    return query execute format(
      $q$
        with revenue as (
          select (hct.created_at at time zone 'utc')::date as date,
                 nullif(trim(hct.crop), '') as crop,
                 coalesce(sum(coalesce(hct.total_revenue, hct.total_gross_amount, 0)), 0)::numeric as revenue
          from public.harvest_collection_totals hct
          where hct.company_id = $1
          group by 1, 2
        ),
        exp as (
          select e.expense_date::date as date,
                 nullif(trim(p.%1$I::text), '') as crop,
                 coalesce(sum(e.amount), 0)::numeric as expenses
          from finance.expenses e
          left join projects.projects p on p.id = e.project_id
          where e.company_id = $1
          group by 1, 2
        ),
        y as (
          select (h.%2$I)::date as date,
                 nullif(trim(p.%3$I::text), '') as crop,
                 coalesce(sum(h.%4$I), 0)::numeric as yield
          from harvest.harvests h
          join projects.projects p on p.id = h.project_id
          where h.company_id = $1
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
      harvest_yield_col
    ) using p_company_id;
    return;
  end if;

  return query execute format(
    $q$
      with revenue as (
        select h.created_at::date as date,
               nullif(trim(p.%1$I::text), '') as crop,
               coalesce(sum(coalesce(h.quantity, 0) * coalesce(h.price_per_unit, 0)), 0)::numeric as revenue
        from harvest.harvests h
        join projects.projects p on p.id = h.project_id
        where h.company_id = $1
        group by 1, 2
      ),
      exp as (
        select e.expense_date::date as date,
               nullif(trim(p.%2$I::text), '') as crop,
               coalesce(sum(e.amount), 0)::numeric as expenses
        from finance.expenses e
        left join projects.projects p on p.id = e.project_id
        where e.company_id = $1
        group by 1, 2
      ),
      y as (
        select (h.%3$I)::date as date,
               nullif(trim(p.%1$I::text), '') as crop,
               coalesce(sum(h.%4$I), 0)::numeric as yield
        from harvest.harvests h
        join projects.projects p on p.id = h.project_id
        where h.company_id = $1
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
    harvest_yield_col
  ) using p_company_id;
end;
$$;

grant execute on function public.analytics_monthly_revenue(uuid) to authenticated;
grant execute on function public.analytics_expense_breakdown(uuid) to authenticated;
grant execute on function public.analytics_crop_yield(uuid) to authenticated;
grant execute on function public.analytics_crop_profit(uuid) to authenticated;
grant execute on function public.analytics_report_detail_rows(uuid) to authenticated;

commit;
