-- Analytics RPCs: avoid referencing harvest.fallback_harvest_sessions unless it exists.
-- Uses EXECUTE for SQL that mentions that table so CREATE FUNCTION succeeds when the table
-- is missing (partial migrations / older DBs). Runtime checks _table_exists before executing.

begin;

-- -----------------------------------------------------------------------------
-- analytics_monthly_revenue
-- -----------------------------------------------------------------------------
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
  use_fb boolean := public._table_exists('harvest', 'fallback_harvest_sessions');
begin
  use_hct := public._table_exists('public', 'harvest_collection_totals')
    and public._column_exists('public', 'harvest_collection_totals', 'company_id')
    and public._column_exists('public', 'harvest_collection_totals', 'created_at');

  use_hct_total_revenue := public._column_exists('public', 'harvest_collection_totals', 'total_revenue');
  use_hct_total_gross := public._column_exists('public', 'harvest_collection_totals', 'total_gross_amount');
  use_hct_created_at := public._column_exists('public', 'harvest_collection_totals', 'created_at');

  if use_hct and use_hct_created_at and (use_hct_total_revenue or use_hct_total_gross) then
    if use_fb then
      return query execute $sql$
        with base as (
          select date_trunc('month', hct.created_at)::date as month,
                 coalesce(sum(coalesce(hct.total_revenue, hct.total_gross_amount, 0)), 0)::numeric as revenue
          from public.harvest_collection_totals hct
          where hct.company_id = $1
          group by 1
          union all
          select date_trunc('month', s.created_at)::date as month,
                 coalesce(sum(coalesce(d.total_revenue, s.total_revenue, 0)), 0)::numeric as revenue
          from harvest.tomato_harvest_sessions s
          left join harvest.tomato_market_dispatches d
            on d.harvest_session_id = s.id and d.company_id = s.company_id
          where s.company_id = $1
          group by 1
          union all
          select date_trunc('month', fs.created_at)::date as month,
                 coalesce(sum(coalesce(fs.total_revenue, 0)), 0)::numeric as revenue
          from harvest.fallback_harvest_sessions fs
          where fs.company_id = $1
          group by 1
        )
        select month, coalesce(sum(revenue), 0)::numeric as revenue
        from base
        group by 1
        order by 1
      $sql$ using p_company_id;
    else
      return query
        with base as (
          select date_trunc('month', hct.created_at)::date as month,
                 coalesce(sum(coalesce(hct.total_revenue, hct.total_gross_amount, 0)), 0)::numeric as revenue
          from public.harvest_collection_totals hct
          where hct.company_id = p_company_id
          group by 1
          union all
          select date_trunc('month', s.created_at)::date as month,
                 coalesce(sum(coalesce(d.total_revenue, s.total_revenue, 0)), 0)::numeric as revenue
          from harvest.tomato_harvest_sessions s
          left join harvest.tomato_market_dispatches d
            on d.harvest_session_id = s.id and d.company_id = s.company_id
          where s.company_id = p_company_id
          group by 1
        )
        select month, coalesce(sum(revenue), 0)::numeric as revenue
        from base
        group by 1
        order by 1;
    end if;
    return;
  end if;

  if use_fb then
    return query execute $sql$
      with base as (
        select date_trunc('month', h.created_at)::date as month,
               coalesce(sum(coalesce(h.quantity, 0) * coalesce(h.price_per_unit, 0)), 0)::numeric as revenue
        from harvest.harvests h
        where h.company_id = $1
        group by 1
        union all
        select date_trunc('month', s.created_at)::date as month,
               coalesce(sum(coalesce(d.total_revenue, s.total_revenue, 0)), 0)::numeric as revenue
        from harvest.tomato_harvest_sessions s
        left join harvest.tomato_market_dispatches d
          on d.harvest_session_id = s.id and d.company_id = s.company_id
        where s.company_id = $1
        group by 1
        union all
        select date_trunc('month', fs.created_at)::date as month,
               coalesce(sum(coalesce(fs.total_revenue, 0)), 0)::numeric as revenue
        from harvest.fallback_harvest_sessions fs
        where fs.company_id = $1
        group by 1
      )
      select month, coalesce(sum(revenue), 0)::numeric as revenue
      from base
      group by 1
      order by 1
    $sql$ using p_company_id;
  else
    return query
      with base as (
        select date_trunc('month', h.created_at)::date as month,
               coalesce(sum(coalesce(h.quantity, 0) * coalesce(h.price_per_unit, 0)), 0)::numeric as revenue
        from harvest.harvests h
        where h.company_id = p_company_id
        group by 1
        union all
        select date_trunc('month', s.created_at)::date as month,
               coalesce(sum(coalesce(d.total_revenue, s.total_revenue, 0)), 0)::numeric as revenue
        from harvest.tomato_harvest_sessions s
        left join harvest.tomato_market_dispatches d
          on d.harvest_session_id = s.id and d.company_id = s.company_id
        where s.company_id = p_company_id
        group by 1
      )
      select month, coalesce(sum(revenue), 0)::numeric as revenue
      from base
      group by 1
      order by 1;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- analytics_report_detail_rows (dynamic SQL already; duplicate with/without fallback union)
-- -----------------------------------------------------------------------------
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
  use_fb boolean := public._table_exists('harvest', 'fallback_harvest_sessions');
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
    if use_fb then
      return query execute format(
        $q$
        with revenue as (
          select (hct.created_at at time zone 'utc')::date as date,
                 nullif(trim(hct.crop), '') as crop,
                 coalesce(sum(coalesce(hct.total_revenue, hct.total_gross_amount, 0)), 0)::numeric as revenue
          from public.harvest_collection_totals hct
          where hct.company_id = $1
          group by 1, 2
          union all
          select (s.created_at at time zone 'utc')::date as date,
                 nullif(trim(p.%1$I::text), '') as crop,
                 coalesce(sum(coalesce(d.total_revenue, s.total_revenue, 0)), 0)::numeric as revenue
          from harvest.tomato_harvest_sessions s
          join projects.projects p on p.id = s.project_id
          left join harvest.tomato_market_dispatches d
            on d.harvest_session_id = s.id and d.company_id = s.company_id
          where s.company_id = $1
          group by 1, 2
          union all
          select (fs.created_at at time zone 'utc')::date as date,
                 nullif(trim(p.%1$I::text), '') as crop,
                 coalesce(sum(coalesce(fs.total_revenue, 0)), 0)::numeric as revenue
          from harvest.fallback_harvest_sessions fs
          join projects.projects p on p.id = fs.project_id
          where fs.company_id = $1
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
               coalesce(sum(revenue.revenue), 0)::numeric as revenue,
               coalesce(exp.expenses, 0)::numeric as expenses,
               (coalesce(sum(revenue.revenue), 0) - coalesce(exp.expenses, 0))::numeric as profit,
               coalesce(y.yield, 0)::numeric as yield
        from revenue
        full outer join exp on exp.date = revenue.date and exp.crop is not distinct from revenue.crop
        full outer join y on y.date = coalesce(revenue.date, exp.date) and y.crop is not distinct from coalesce(revenue.crop, exp.crop)
        group by 1, 2, exp.expenses, y.yield
        order by date desc nulls last, crop asc nulls last
      $q$,
        harvest_crop_col,
        expenses_crop_col,
        harvest_date_col,
        harvest_yield_col
      ) using p_company_id;
    else
      return query execute format(
        $q$
        with revenue as (
          select (hct.created_at at time zone 'utc')::date as date,
                 nullif(trim(hct.crop), '') as crop,
                 coalesce(sum(coalesce(hct.total_revenue, hct.total_gross_amount, 0)), 0)::numeric as revenue
          from public.harvest_collection_totals hct
          where hct.company_id = $1
          group by 1, 2
          union all
          select (s.created_at at time zone 'utc')::date as date,
                 nullif(trim(p.%1$I::text), '') as crop,
                 coalesce(sum(coalesce(d.total_revenue, s.total_revenue, 0)), 0)::numeric as revenue
          from harvest.tomato_harvest_sessions s
          join projects.projects p on p.id = s.project_id
          left join harvest.tomato_market_dispatches d
            on d.harvest_session_id = s.id and d.company_id = s.company_id
          where s.company_id = $1
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
               coalesce(sum(revenue.revenue), 0)::numeric as revenue,
               coalesce(exp.expenses, 0)::numeric as expenses,
               (coalesce(sum(revenue.revenue), 0) - coalesce(exp.expenses, 0))::numeric as profit,
               coalesce(y.yield, 0)::numeric as yield
        from revenue
        full outer join exp on exp.date = revenue.date and exp.crop is not distinct from revenue.crop
        full outer join y on y.date = coalesce(revenue.date, exp.date) and y.crop is not distinct from coalesce(revenue.crop, exp.crop)
        group by 1, 2, exp.expenses, y.yield
        order by date desc nulls last, crop asc nulls last
      $q$,
        harvest_crop_col,
        expenses_crop_col,
        harvest_date_col,
        harvest_yield_col
      ) using p_company_id;
    end if;
    return;
  end if;

  if use_fb then
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
        union all
        select (s.created_at at time zone 'utc')::date as date,
               nullif(trim(p.%1$I::text), '') as crop,
               coalesce(sum(coalesce(d.total_revenue, s.total_revenue, 0)), 0)::numeric as revenue
        from harvest.tomato_harvest_sessions s
        join projects.projects p on p.id = s.project_id
        left join harvest.tomato_market_dispatches d
          on d.harvest_session_id = s.id and d.company_id = s.company_id
        where s.company_id = $1
        group by 1, 2
        union all
        select (fs.created_at at time zone 'utc')::date as date,
               nullif(trim(p.%1$I::text), '') as crop,
               coalesce(sum(coalesce(fs.total_revenue, 0)), 0)::numeric as revenue
        from harvest.fallback_harvest_sessions fs
        join projects.projects p on p.id = fs.project_id
        where fs.company_id = $1
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
             coalesce(sum(revenue.revenue), 0)::numeric as revenue,
             coalesce(exp.expenses, 0)::numeric as expenses,
             (coalesce(sum(revenue.revenue), 0) - coalesce(exp.expenses, 0))::numeric as profit,
             coalesce(y.yield, 0)::numeric as yield
      from revenue
      full outer join exp on exp.date = revenue.date and exp.crop is not distinct from revenue.crop
      full outer join y on y.date = coalesce(revenue.date, exp.date) and y.crop is not distinct from coalesce(revenue.crop, exp.crop)
      group by 1, 2, exp.expenses, y.yield
      order by date desc nulls last, crop asc nulls last
    $q$,
      harvest_crop_col,
      expenses_crop_col,
      harvest_date_col,
      harvest_yield_col
    ) using p_company_id;
  else
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
        union all
        select (s.created_at at time zone 'utc')::date as date,
               nullif(trim(p.%1$I::text), '') as crop,
               coalesce(sum(coalesce(d.total_revenue, s.total_revenue, 0)), 0)::numeric as revenue
        from harvest.tomato_harvest_sessions s
        join projects.projects p on p.id = s.project_id
        left join harvest.tomato_market_dispatches d
          on d.harvest_session_id = s.id and d.company_id = s.company_id
        where s.company_id = $1
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
             coalesce(sum(revenue.revenue), 0)::numeric as revenue,
             coalesce(exp.expenses, 0)::numeric as expenses,
             (coalesce(sum(revenue.revenue), 0) - coalesce(exp.expenses, 0))::numeric as profit,
             coalesce(y.yield, 0)::numeric as yield
      from revenue
      full outer join exp on exp.date = revenue.date and exp.crop is not distinct from revenue.crop
      full outer join y on y.date = coalesce(revenue.date, exp.date) and y.crop is not distinct from coalesce(revenue.crop, exp.crop)
      group by 1, 2, exp.expenses, y.yield
      order by date desc nulls last, crop asc nulls last
    $q$,
      harvest_crop_col,
      expenses_crop_col,
      harvest_date_col,
      harvest_yield_col
    ) using p_company_id;
  end if;
end;
$$;

grant execute on function public.analytics_monthly_revenue(uuid) to authenticated;
grant execute on function public.analytics_report_detail_rows(uuid) to authenticated;

commit;
