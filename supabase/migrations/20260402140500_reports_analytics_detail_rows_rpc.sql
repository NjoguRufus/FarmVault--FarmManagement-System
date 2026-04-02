-- Detailed report rows for exports (CSV/PDF)

begin;

-- Standardize RPC param type to uuid to avoid PostgREST overload ambiguity (PGRST203).
drop function if exists public.analytics_report_detail_rows(p_company_id text);
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

  -- harvest.harvests doesn't store crop; infer from projects.projects.crop_type
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

  -- Fallback: compute revenue from harvest.harvests as quantity * price_per_unit
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

commit;

