-- Fix analytics_crop_profit when harvests has no company_id

begin;

create or replace function public.analytics_crop_profit(p_company_id text)
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
  harvest_crop_col text;
  expenses_crop_col text;
  has_h_company boolean := false;
  has_h_project boolean := false;
begin
  use_hct := public._table_exists('public', 'harvest_collection_totals')
    and public._column_exists('public', 'harvest_collection_totals', 'company_id');
  use_hct_crop := public._column_exists('public', 'harvest_collection_totals', 'crop');
  use_hct_total_revenue := public._column_exists('public', 'harvest_collection_totals', 'total_revenue');

  expenses_crop_col :=
    case
      when public._column_exists('public','expenses','crop_type') then 'crop_type'
      when public._column_exists('public','expenses','crop') then 'crop'
      else null
    end;

  if expenses_crop_col is null then
    return;
  end if;

  if use_hct and use_hct_crop and use_hct_total_revenue then
    -- Revenue from harvest_collection_totals; expenses grouped by crop column (dynamic).
    return query execute format(
      $q$
        with revenue as (
          select nullif(trim(hct.crop), '') as crop,
                 coalesce(sum(hct.total_revenue), 0)::numeric as total_revenue
          from public.harvest_collection_totals hct
          where hct.company_id::text = $1
          group by 1
        ),
        exp as (
          select nullif(trim(e.%1$I::text), '') as crop,
                 coalesce(sum(e.amount), 0)::numeric as total_expenses
          from public.expenses e
          where e.company_id::text = $1
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
      expenses_crop_col
    ) using p_company_id;
    return;
  end if;

  -- Fallback: revenue from harvests.farm_total_price, but harvests might not have company_id
  harvest_crop_col :=
    case
      when public._column_exists('public','harvests','crop_type') then 'crop_type'
      when public._column_exists('public','harvests','crop') then 'crop'
      else null
    end;

  if harvest_crop_col is null then
    return;
  end if;

  has_h_company := public._column_exists('public','harvests','company_id');
  has_h_project := public._column_exists('public','harvests','project_id') and public._column_exists('public','projects','company_id');

  if not has_h_company and not has_h_project then
    return;
  end if;

  return query execute format(
    $q$
      with revenue as (
        select nullif(trim(h.%1$I::text), '') as crop,
               coalesce(sum(coalesce(h.farm_total_price, 0)), 0)::numeric as total_revenue
        from public.harvests h
        %3$s
        where %4$s
        group by 1
      ),
      exp as (
        select nullif(trim(e.%2$I::text), '') as crop,
               coalesce(sum(e.amount), 0)::numeric as total_expenses
        from public.expenses e
        where e.company_id::text = $1
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
    case when has_h_project and not has_h_company then 'join public.projects p on p.id = h.project_id' else '' end,
    case when has_h_company then 'h.company_id::text = $1' else 'p.company_id::text = $1' end
  ) using p_company_id;
end;
$$;

commit;

