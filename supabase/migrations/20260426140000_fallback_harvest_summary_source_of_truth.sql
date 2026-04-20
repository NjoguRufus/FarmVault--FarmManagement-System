-- Fallback (modular) harvest single source of truth:
-- - harvest.get_fallback_session_summary(session_id)
-- - harvest.get_fallback_dashboard_summary(company_id, project_id)
-- - NOTIFY update_fallback_session_summary on unit/buyer/expense/packaging changes

begin;

-- -----------------------------------------------------------------------------
-- 1) Canonical per-session summary
-- -----------------------------------------------------------------------------

drop function if exists harvest.get_fallback_session_summary(uuid);

create function harvest.get_fallback_session_summary(p_session_id uuid)
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
      and l.ref_id = s.id::text
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

-- -----------------------------------------------------------------------------
-- 2) Company/project dashboard summary
-- -----------------------------------------------------------------------------

drop function if exists harvest.get_fallback_dashboard_summary(uuid, uuid);

create function harvest.get_fallback_dashboard_summary(
  p_company_id uuid,
  p_project_id uuid default null
)
returns table (
  total_units numeric,
  total_revenue numeric,
  total_expenses numeric,
  net_profit numeric
)
language sql
stable
security invoker
set search_path = harvest, public
as $$
  with sess as (
    select s.id
    from harvest.fallback_harvest_sessions s
    where s.company_id = p_company_id
      and (p_project_id is null or s.project_id = p_project_id)
  ),
  roll as (
    select
      coalesce(sum(x.total_units), 0)::numeric as total_units,
      coalesce(sum(x.revenue_total), 0)::numeric as total_revenue,
      coalesce(sum(x.expenses_total), 0)::numeric as total_expenses
    from sess
    join lateral harvest.get_fallback_session_summary(sess.id) x on true
  )
  select
    roll.total_units,
    roll.total_revenue,
    roll.total_expenses,
    (roll.total_revenue - roll.total_expenses)::numeric as net_profit
  from roll;
$$;

grant execute on function harvest.get_fallback_dashboard_summary(uuid, uuid) to authenticated;
grant execute on function harvest.get_fallback_dashboard_summary(uuid, uuid) to service_role;

-- -----------------------------------------------------------------------------
-- 3) NOTIFY update_fallback_session_summary on relevant changes
-- -----------------------------------------------------------------------------

create or replace function harvest.notify_update_fallback_session_summary(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = harvest, public
as $$
begin
  if p_session_id is null then
    return;
  end if;
  perform pg_notify('update_fallback_session_summary', p_session_id::text);
end;
$$;

revoke all on function harvest.notify_update_fallback_session_summary(uuid) from public;
grant execute on function harvest.notify_update_fallback_session_summary(uuid) to authenticated, service_role;

create or replace function harvest.tr_notify_fallback_summary_from_units()
returns trigger
language plpgsql
security invoker
set search_path = harvest, public
as $$
declare
  sid uuid;
begin
  sid := coalesce(new.harvest_session_id, old.harvest_session_id);
  perform harvest.notify_update_fallback_session_summary(sid);
  return coalesce(new, old);
end;
$$;

drop trigger if exists tr_fallback_harvest_units_notify_summary on harvest.fallback_harvest_units;
create trigger tr_fallback_harvest_units_notify_summary
  after insert or update or delete on harvest.fallback_harvest_units
  for each row
  execute function harvest.tr_notify_fallback_summary_from_units();

create or replace function harvest.tr_notify_fallback_summary_from_session()
returns trigger
language plpgsql
security invoker
set search_path = harvest, public
as $$
begin
  perform harvest.notify_update_fallback_session_summary(coalesce(new.id, old.id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists tr_fallback_harvest_sessions_notify_summary on harvest.fallback_harvest_sessions;
create trigger tr_fallback_harvest_sessions_notify_summary
  after update on harvest.fallback_harvest_sessions
  for each row
  execute function harvest.tr_notify_fallback_summary_from_session();

create or replace function harvest.tr_notify_fallback_summary_from_market_child()
returns trigger
language plpgsql
security invoker
set search_path = harvest, public
as $$
declare
  did uuid;
  sid uuid;
begin
  did := coalesce(new.market_dispatch_id, old.market_dispatch_id);
  select d.harvest_session_id into sid
  from harvest.fallback_market_dispatches d
  where d.id = did;

  perform harvest.notify_update_fallback_session_summary(sid);
  return coalesce(new, old);
end;
$$;

drop trigger if exists tr_fallback_market_sales_entries_notify_summary on harvest.fallback_market_sales_entries;
create trigger tr_fallback_market_sales_entries_notify_summary
  after insert or update or delete on harvest.fallback_market_sales_entries
  for each row
  execute function harvest.tr_notify_fallback_summary_from_market_child();

drop trigger if exists tr_fallback_market_expense_lines_notify_summary on harvest.fallback_market_expense_lines;
create trigger tr_fallback_market_expense_lines_notify_summary
  after insert or update or delete on harvest.fallback_market_expense_lines
  for each row
  execute function harvest.tr_notify_fallback_summary_from_market_child();

commit;

