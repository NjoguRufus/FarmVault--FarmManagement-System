-- Fix fallback summary: finance.expense_links.ref_id is UUID (not text).

begin;

create or replace function harvest.get_fallback_session_summary(p_session_id uuid)
returns table (
  total_units numeric,
  total_containers numeric,
  revenue_total numeric,
  expenses_total numeric,
  net_profit numeric
)
language sql
stable
security invoker
set search_path = harvest, public, finance
as $$
  with s as (
    select
      hs.id,
      hs.company_id,
      hs.project_id,
      hs.destination,
      hs.price_per_unit,
      hs.auto_units_sold,
      hs.units_sold,
      coalesce(hs.total_containers, 0)::numeric as total_containers
    from harvest.fallback_harvest_sessions hs
    where hs.id = p_session_id
    limit 1
  ),
  u as (
    select coalesce(sum(hu.units), 0)::numeric as total_units
    from harvest.fallback_harvest_units hu
    join s on s.id = hu.harvest_session_id
    where hu.company_id = s.company_id
  ),
  d as (
    select md.id as dispatch_id
    from harvest.fallback_market_dispatches md
    join s on s.id = md.harvest_session_id
    where md.company_id = s.company_id
    limit 1
  ),
  market_rev as (
    select coalesce(sum(e.quantity::numeric * e.price_per_unit), 0)::numeric as revenue_total
    from harvest.fallback_market_sales_entries e
    join d on d.dispatch_id = e.market_dispatch_id
    join s on s.company_id = e.company_id
  ),
  farm_rev as (
    select
      round(
        coalesce(s.price_per_unit, 0)::numeric
        *
        coalesce(
          case
            when s.auto_units_sold is true or s.units_sold is null then u.total_units
            else greatest(0, s.units_sold)::numeric
          end,
          0::numeric
        ),
        2
      ) as revenue_total
    from s
    cross join u
  ),
  market_exp as (
    select coalesce(sum(x.amount), 0)::numeric as market_expenses
    from harvest.fallback_market_expense_lines x
    join d on d.dispatch_id = x.market_dispatch_id
    join s on s.company_id = x.company_id
  ),
  linked_fin_exp as (
    select coalesce(sum(e.amount), 0)::numeric as linked_expenses
    from finance.expense_links l
    join finance.expenses e
      on e.id = l.expense_id
      and e.company_id = l.company_id
    join s on s.company_id = l.company_id
    where l.ref_type = 'fallback_harvest_session'
      and l.ref_id = s.id
  )
  select
    u.total_units,
    s.total_containers,
    case
      when upper(coalesce(s.destination, 'FARM')) = 'MARKET' then market_rev.revenue_total
      else farm_rev.revenue_total
    end as revenue_total,
    round((linked_fin_exp.linked_expenses + market_exp.market_expenses), 2) as expenses_total,
    round(
      (
        case
          when upper(coalesce(s.destination, 'FARM')) = 'MARKET' then market_rev.revenue_total
          else farm_rev.revenue_total
        end
        - (linked_fin_exp.linked_expenses + market_exp.market_expenses)
      ),
      2
    ) as net_profit
  from s
  cross join u
  cross join market_rev
  cross join farm_rev
  cross join market_exp
  cross join linked_fin_exp;
$$;

grant execute on function harvest.get_fallback_session_summary(uuid) to authenticated;
grant execute on function harvest.get_fallback_session_summary(uuid) to service_role;

commit;

