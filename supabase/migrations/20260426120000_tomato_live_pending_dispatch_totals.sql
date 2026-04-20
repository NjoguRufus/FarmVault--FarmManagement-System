-- Make dashboard tomato aggregates include live broker notebook totals for pending market dispatches.
-- This aligns dashboard + lists with session detail ("Live total from broker notebook").

begin;

drop function if exists harvest.company_tomato_harvest_aggregate(uuid, uuid);

create function harvest.company_tomato_harvest_aggregate(
  p_company_id uuid,
  p_project_id uuid default null
)
returns table (
  total_revenue numeric,
  total_buckets bigint,
  total_crates bigint,
  picker_cost numeric,
  pending_market_dispatches bigint,
  total_market_expenses numeric
)
language sql
stable
set search_path = harvest, public
as $$
  with base as (
    select
      s.id as sid,
      s.company_id,
      s.project_id,
      s.packaging_count,
      s.picker_rate_per_bucket,
      s.sale_mode,
      s.total_revenue as s_total_revenue,
      s.price_per_container as s_price,
      s.sale_units as s_units,
      coalesce(b.bucket_sum, 0)::bigint as bucket_sum,
      d.id as d_id,
      d.status as d_status,
      d.total_revenue as d_total_revenue,
      d.broker_sales_revenue as d_broker_sales_revenue,
      d.market_expenses_total as d_market_expenses_total,
      d.price_per_container as d_price,
      d.containers_sent as d_containers
    from harvest.tomato_harvest_sessions s
    left join (
      select harvest_session_id, sum(units)::bigint as bucket_sum
      from harvest.tomato_harvest_picker_logs
      where company_id = p_company_id
      group by harvest_session_id
    ) b on b.harvest_session_id = s.id
    left join harvest.tomato_market_dispatches d
      on d.harvest_session_id = s.id
      and d.company_id = s.company_id
    where s.company_id = p_company_id
      and (p_project_id is null or s.project_id = p_project_id)
  ),
  line as (
    select
      case
        when sale_mode = 'market' then
          case
            when d_id is not null then
              coalesce(
                case
                  when d_broker_sales_revenue is not null and d_broker_sales_revenue > 0
                  then d_broker_sales_revenue::numeric
                end,
                case
                  when d_total_revenue is not null and d_total_revenue >= 0
                  then d_total_revenue::numeric
                end,
                case
                  when d_status = 'completed'
                    and d_price is not null
                    and coalesce(d_containers, 0) > 0
                  then (d_price * d_containers)::numeric
                end,
                0::numeric
              )
            else
              coalesce(
                case when s_total_revenue is not null and s_total_revenue >= 0 then s_total_revenue::numeric end,
                case
                  when s_price is not null and s_units is not null
                  then (s_price * s_units)::numeric
                end,
                0::numeric
              )
          end
        else
          coalesce(
            case when s_total_revenue is not null and s_total_revenue >= 0 then s_total_revenue::numeric end,
            case
              when s_price is not null and s_units is not null
              then (s_price * s_units)::numeric
            end,
            0::numeric
          )
      end as rev,
      bucket_sum,
      packaging_count::bigint as crates,
      (bucket_sum * picker_rate_per_bucket)::numeric as pcost,
      case
        when sale_mode = 'market' and d_id is not null
        then coalesce(d_market_expenses_total, 0)::numeric
        else 0::numeric
      end as mexp
    from base
  )
  select
    coalesce(sum(rev), 0)::numeric as total_revenue,
    coalesce(sum(bucket_sum), 0)::bigint as total_buckets,
    coalesce(sum(crates), 0)::bigint as total_crates,
    coalesce(sum(pcost), 0)::numeric as picker_cost,
    (
      select count(*)::bigint
      from harvest.tomato_market_dispatches md
      join harvest.tomato_harvest_sessions ss on ss.id = md.harvest_session_id
      where md.company_id = p_company_id
        and md.status = 'pending'
        and (p_project_id is null or ss.project_id = p_project_id)
    ) as pending_market_dispatches,
    coalesce(sum(mexp), 0)::numeric as total_market_expenses
  from line;
$$;

grant execute on function harvest.company_tomato_harvest_aggregate(uuid, uuid) to authenticated;
grant execute on function harvest.company_tomato_harvest_aggregate(uuid, uuid) to service_role;

-- Monthly revenue should also reflect live broker notebook totals for market sessions.
create or replace function harvest.company_tomato_monthly_revenue(
  p_company_id uuid
)
returns table (
  month date,
  revenue numeric
)
language sql
stable
set search_path = harvest, public
as $$
  with base as (
    select
      s.session_date,
      s.sale_mode,
      s.total_revenue as s_total_revenue,
      s.price_per_container as s_price,
      s.sale_units as s_units,
      d.id as d_id,
      d.status as d_status,
      d.total_revenue as d_total_revenue,
      d.broker_sales_revenue as d_broker_sales_revenue,
      d.price_per_container as d_price,
      d.containers_sent as d_containers
    from harvest.tomato_harvest_sessions s
    left join harvest.tomato_market_dispatches d
      on d.harvest_session_id = s.id
      and d.company_id = s.company_id
    where s.company_id = p_company_id
  ),
  line as (
    select
      date_trunc('month', session_date::timestamp)::date as m,
      case
        when sale_mode = 'market' then
          case
            when d_id is not null then
              coalesce(
                case
                  when d_broker_sales_revenue is not null and d_broker_sales_revenue > 0
                  then d_broker_sales_revenue::numeric
                end,
                case
                  when d_total_revenue is not null and d_total_revenue >= 0
                  then d_total_revenue::numeric
                end,
                case
                  when d_status = 'completed'
                    and d_price is not null
                    and coalesce(d_containers, 0) > 0
                  then (d_price * d_containers)::numeric
                end,
                0::numeric
              )
            else
              coalesce(
                case when s_total_revenue is not null and s_total_revenue >= 0 then s_total_revenue::numeric end,
                case
                  when s_price is not null and s_units is not null
                  then (s_price * s_units)::numeric
                end,
                0::numeric
              )
          end
        else
          coalesce(
            case when s_total_revenue is not null and s_total_revenue >= 0 then s_total_revenue::numeric end,
            case
              when s_price is not null and s_units is not null
              then (s_price * s_units)::numeric
            end,
            0::numeric
          )
      end as rev
    from base
  )
  select m as month, coalesce(sum(rev), 0)::numeric as revenue
  from line
  group by m
  order by m;
$$;

grant execute on function harvest.company_tomato_monthly_revenue(uuid) to authenticated;
grant execute on function harvest.company_tomato_monthly_revenue(uuid) to service_role;

commit;

