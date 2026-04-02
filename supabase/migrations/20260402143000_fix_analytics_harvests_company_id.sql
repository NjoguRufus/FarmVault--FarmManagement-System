-- Fix analytics RPCs for schemas where harvests has no company_id
-- Scope harvests via projects.company_id using harvests.project_id

begin;

create or replace function public.analytics_monthly_revenue(p_company_id text)
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
  has_h_company boolean := false;
  has_h_project boolean := false;
begin
  use_hct := public._table_exists('public', 'harvest_collection_totals')
    and public._column_exists('public', 'harvest_collection_totals', 'company_id')
    and public._column_exists('public', 'harvest_collection_totals', 'created_at');

  use_hct_total_revenue := public._column_exists('public', 'harvest_collection_totals', 'total_revenue');
  use_hct_created_at := public._column_exists('public', 'harvest_collection_totals', 'created_at');

  if use_hct and use_hct_total_revenue and use_hct_created_at then
    return query
      select date_trunc('month', hct.created_at)::date as month,
             coalesce(sum(hct.total_revenue), 0)::numeric as revenue
      from public.harvest_collection_totals hct
      where hct.company_id::text = p_company_id
      group by 1
      order by 1;
    return;
  end if;

  has_h_company := public._column_exists('public','harvests','company_id');
  has_h_project := public._column_exists('public','harvests','project_id') and public._column_exists('public','projects','company_id');

  if has_h_company then
    return query
      select date_trunc('month', h.created_at)::date as month,
             coalesce(sum(coalesce(h.farm_total_price, 0)), 0)::numeric as revenue
      from public.harvests h
      where h.company_id::text = p_company_id
      group by 1
      order by 1;
    return;
  end if;

  if has_h_project then
    return query
      select date_trunc('month', h.created_at)::date as month,
             coalesce(sum(coalesce(h.farm_total_price, 0)), 0)::numeric as revenue
      from public.harvests h
      join public.projects p on p.id = h.project_id
      where p.company_id::text = p_company_id
      group by 1
      order by 1;
    return;
  end if;
end;
$$;

create or replace function public.analytics_crop_yield(p_company_id text)
returns table(crop text, total_yield numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  crop_col text;
  yield_col text;
  has_h_company boolean := false;
  has_h_project boolean := false;
  sql text;
begin
  crop_col :=
    case
      when public._column_exists('public','harvests','crop_type') then 'crop_type'
      when public._column_exists('public','harvests','crop') then 'crop'
      else null
    end;

  yield_col :=
    case
      when public._column_exists('public','harvests','total_yield') then 'total_yield'
      when public._column_exists('public','harvests','total_yield_kg') then 'total_yield_kg'
      when public._column_exists('public','harvests','quantity') then 'quantity'
      else null
    end;

  if crop_col is null or yield_col is null then
    return;
  end if;

  has_h_company := public._column_exists('public','harvests','company_id');
  has_h_project := public._column_exists('public','harvests','project_id') and public._column_exists('public','projects','company_id');

  if has_h_company then
    sql := format(
      $q$
        select nullif(trim(h.%1$I::text), '') as crop,
               coalesce(sum(h.%2$I), 0)::numeric as total_yield
        from public.harvests h
        where h.company_id::text = $1
        group by 1
        order by total_yield desc
      $q$,
      crop_col,
      yield_col
    );
    return query execute sql using p_company_id;
  end if;

  if has_h_project then
    sql := format(
      $q$
        select nullif(trim(h.%1$I::text), '') as crop,
               coalesce(sum(h.%2$I), 0)::numeric as total_yield
        from public.harvests h
        join public.projects p on p.id = h.project_id
        where p.company_id::text = $1
        group by 1
        order by total_yield desc
      $q$,
      crop_col,
      yield_col
    );
    return query execute sql using p_company_id;
  end if;
end;
$$;

-- Detail rows uses harvests for yield + fallback revenue; scope harvests via company_id OR projects.company_id.
create or replace function public.analytics_report_detail_rows(p_company_id text)
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
as $$
declare
  use_hct boolean := false;
  use_hct_created_at boolean := false;
  use_hct_total_revenue boolean := false;
  use_hct_crop boolean := false;
  harvest_crop_col text;
  expenses_crop_col text;
  harvest_yield_col text;
  harvest_date_col text;
  has_h_company boolean := false;
  has_h_project boolean := false;
begin
  use_hct := public._table_exists('public', 'harvest_collection_totals')
    and public._column_exists('public', 'harvest_collection_totals', 'company_id');
  use_hct_created_at := public._column_exists('public', 'harvest_collection_totals', 'created_at');
  use_hct_total_revenue := public._column_exists('public', 'harvest_collection_totals', 'total_revenue');
  use_hct_crop := public._column_exists('public', 'harvest_collection_totals', 'crop');

  harvest_crop_col :=
    case
      when public._column_exists('public','harvests','crop_type') then 'crop_type'
      when public._column_exists('public','harvests','crop') then 'crop'
      else null
    end;
  expenses_crop_col :=
    case
      when public._column_exists('public','expenses','crop_type') then 'crop_type'
      when public._column_exists('public','expenses','crop') then 'crop'
      else null
    end;
  harvest_yield_col :=
    case
      when public._column_exists('public','harvests','total_yield') then 'total_yield'
      when public._column_exists('public','harvests','total_yield_kg') then 'total_yield_kg'
      when public._column_exists('public','harvests','quantity') then 'quantity'
      else null
    end;
  harvest_date_col :=
    case
      when public._column_exists('public','harvests','harvest_date') then 'harvest_date'
      when public._column_exists('public','harvests','date') then 'date'
      when public._column_exists('public','harvests','created_at') then 'created_at'
      else null
    end;

  if harvest_crop_col is null or expenses_crop_col is null or harvest_yield_col is null or harvest_date_col is null then
    return;
  end if;

  has_h_company := public._column_exists('public','harvests','company_id');
  has_h_project := public._column_exists('public','harvests','project_id') and public._column_exists('public','projects','company_id');

  if not has_h_company and not has_h_project then
    return;
  end if;

  if use_hct and use_hct_created_at and use_hct_total_revenue and use_hct_crop then
    return query execute format(
      $q$
        with revenue as (
          select (hct.created_at at time zone 'utc')::date as date,
                 nullif(trim(hct.crop), '') as crop,
                 coalesce(sum(hct.total_revenue), 0)::numeric as revenue
          from public.harvest_collection_totals hct
          where hct.company_id::text = $1
          group by 1, 2
        ),
        exp as (
          select e.date::date as date,
                 nullif(trim(e.%1$I::text), '') as crop,
                 coalesce(sum(e.amount), 0)::numeric as expenses
          from public.expenses e
          where e.company_id::text = $1
          group by 1, 2
        ),
        y as (
          select (h.%2$I)::date as date,
                 nullif(trim(h.%3$I::text), '') as crop,
                 coalesce(sum(h.%4$I), 0)::numeric as yield
          from public.harvests h
          %5$s
          where %6$s
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
      case when has_h_project and not has_h_company then 'join public.projects p on p.id = h.project_id' else '' end,
      case when has_h_company then 'h.company_id::text = $1' else 'p.company_id::text = $1' end
    ) using p_company_id;
    return;
  end if;

  -- Fallback: derive revenue from harvests.farm_total_price
  return query execute format(
    $q$
      with revenue as (
        select h.created_at::date as date,
               nullif(trim(h.%1$I::text), '') as crop,
               coalesce(sum(coalesce(h.farm_total_price, 0)), 0)::numeric as revenue
        from public.harvests h
        %5$s
        where %6$s
        group by 1, 2
      ),
      exp as (
        select e.date::date as date,
               nullif(trim(e.%2$I::text), '') as crop,
               coalesce(sum(e.amount), 0)::numeric as expenses
        from public.expenses e
        where e.company_id::text = $1
        group by 1, 2
      ),
      y as (
        select (h.%3$I)::date as date,
               nullif(trim(h.%1$I::text), '') as crop,
               coalesce(sum(h.%4$I), 0)::numeric as yield
        from public.harvests h
        %5$s
        where %6$s
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
    case when has_h_project and not has_h_company then 'join public.projects p on p.id = h.project_id' else '' end,
    case when has_h_company then 'h.company_id::text = $1' else 'p.company_id::text = $1' end
  ) using p_company_id;
end;
$$;

commit;

