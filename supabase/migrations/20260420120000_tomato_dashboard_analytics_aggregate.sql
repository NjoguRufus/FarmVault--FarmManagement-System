-- Tomato harvest: company-level aggregates for dashboard + analytics (read paths).
-- Revenue matches app logic: coalesce(total_revenue, price_per_container * sale_units, 0).

begin;

create or replace function harvest.company_tomato_harvest_aggregate(
  p_company_id uuid,
  p_project_id uuid default null
)
returns table (
  total_revenue numeric,
  total_buckets bigint,
  total_crates bigint,
  picker_cost numeric
)
language sql
stable
set search_path = harvest, public
as $$
  select
    coalesce(sum(
      case
        when s.total_revenue is not null and s.total_revenue >= 0 then s.total_revenue::numeric
        when s.price_per_container is not null and s.sale_units is not null then
          (s.price_per_container * s.sale_units)::numeric
        else 0::numeric
      end
    ), 0)::numeric as total_revenue,
    coalesce(sum(b.bucket_sum), 0)::bigint as total_buckets,
    coalesce(sum(s.packaging_count), 0)::bigint as total_crates,
    coalesce(sum(b.bucket_sum * s.picker_rate_per_bucket), 0)::numeric as picker_cost
  from harvest.tomato_harvest_sessions s
  left join (
    select harvest_session_id, sum(units)::bigint as bucket_sum
    from harvest.tomato_harvest_picker_logs
    where company_id = p_company_id
    group by harvest_session_id
  ) b on b.harvest_session_id = s.id
  where s.company_id = p_company_id
    and (p_project_id is null or s.project_id = p_project_id);
$$;

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
  select
    date_trunc('month', s.session_date::timestamp)::date as month,
    coalesce(sum(
      case
        when s.total_revenue is not null and s.total_revenue >= 0 then s.total_revenue::numeric
        when s.price_per_container is not null and s.sale_units is not null then
          (s.price_per_container * s.sale_units)::numeric
        else 0::numeric
      end
    ), 0)::numeric as revenue
  from harvest.tomato_harvest_sessions s
  where s.company_id = p_company_id
  group by 1
  order by 1;
$$;

grant execute on function harvest.company_tomato_harvest_aggregate(uuid, uuid) to authenticated;
grant execute on function harvest.company_tomato_harvest_aggregate(uuid, uuid) to service_role;
grant execute on function harvest.company_tomato_monthly_revenue(uuid) to authenticated;
grant execute on function harvest.company_tomato_monthly_revenue(uuid) to service_role;

commit;
