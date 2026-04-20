-- Tomato Harvest single source of truth:
-- - harvest.get_tomato_session_summary(session_id)
-- - harvest.get_tomato_dashboard_summary(company_id, project_id)
-- - NOTIFY update_session_summary on buyer/expense/log changes

begin;

-- -----------------------------------------------------------------------------
-- 1) Canonical per-session summary (single source of truth)
-- -----------------------------------------------------------------------------

drop function if exists harvest.get_tomato_session_summary(uuid);

create function harvest.get_tomato_session_summary(p_session_id uuid)
returns table (
  buckets bigint,
  crates bigint,
  pickers_count bigint,

  revenue_total numeric,
  market_expenses_total numeric,
  picker_cost_total numeric,

  total_expenses numeric,
  net_profit numeric
)
language sql
stable
security invoker
set search_path = harvest, public
as $$
  with s as (
    select
      ts.id,
      ts.company_id,
      ts.packaging_count,
      ts.picker_rate_per_bucket
    from harvest.tomato_harvest_sessions ts
    where ts.id = p_session_id
    limit 1
  ),
  d as (
    select
      md.id as dispatch_id
    from harvest.tomato_market_dispatches md
    join s on s.id = md.harvest_session_id
    where md.company_id = s.company_id
    limit 1
  ),
  b as (
    select coalesce(sum(l.units), 0)::bigint as buckets
    from harvest.tomato_harvest_picker_logs l
    join s on s.id = l.harvest_session_id
    where l.company_id = s.company_id
  ),
  p as (
    select count(*)::bigint as pickers_count
    from harvest.tomato_harvest_pickers tp
    join s on s.id = tp.harvest_session_id
    where tp.company_id = s.company_id
  ),
  rev as (
    select coalesce(sum(e.quantity::numeric * e.price_per_unit), 0)::numeric as revenue_total
    from harvest.tomato_market_sales_entries e
    join d on d.dispatch_id = e.market_dispatch_id
    join s on s.company_id = e.company_id
  ),
  exp as (
    select coalesce(sum(x.amount), 0)::numeric as market_expenses_total
    from harvest.tomato_market_expense_lines x
    join d on d.dispatch_id = x.market_dispatch_id
    join s on s.company_id = x.company_id
  )
  select
    b.buckets,
    coalesce(s.packaging_count, 0)::bigint as crates,
    p.pickers_count,
    rev.revenue_total,
    exp.market_expenses_total,
    round((b.buckets::numeric * coalesce(s.picker_rate_per_bucket, 0)::numeric), 2) as picker_cost_total,
    round((exp.market_expenses_total + (b.buckets::numeric * coalesce(s.picker_rate_per_bucket, 0)::numeric)), 2) as total_expenses,
    round((rev.revenue_total - (exp.market_expenses_total + (b.buckets::numeric * coalesce(s.picker_rate_per_bucket, 0)::numeric))), 2) as net_profit
  from s
  cross join b
  cross join p
  cross join rev
  cross join exp;
$$;

grant execute on function harvest.get_tomato_session_summary(uuid) to authenticated;
grant execute on function harvest.get_tomato_session_summary(uuid) to service_role;

-- -----------------------------------------------------------------------------
-- 2) Dashboard summary (company + optional project)
-- -----------------------------------------------------------------------------

drop function if exists harvest.get_tomato_dashboard_summary(uuid, uuid);

create function harvest.get_tomato_dashboard_summary(
  p_company_id uuid,
  p_project_id uuid default null
)
returns table (
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
    from harvest.tomato_harvest_sessions s
    where s.company_id = p_company_id
      and (p_project_id is null or s.project_id = p_project_id)
  ),
  roll as (
    select
      coalesce(sum(x.revenue_total), 0)::numeric as total_revenue,
      coalesce(sum(x.total_expenses), 0)::numeric as total_expenses
    from sess
    join lateral harvest.get_tomato_session_summary(sess.id) x on true
  )
  select
    roll.total_revenue,
    roll.total_expenses,
    (roll.total_revenue - roll.total_expenses)::numeric as net_profit
  from roll;
$$;

grant execute on function harvest.get_tomato_dashboard_summary(uuid, uuid) to authenticated;
grant execute on function harvest.get_tomato_dashboard_summary(uuid, uuid) to service_role;

-- -----------------------------------------------------------------------------
-- 3) NOTIFY update_session_summary on relevant changes
-- -----------------------------------------------------------------------------

create or replace function harvest.notify_update_session_summary(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = harvest, public
as $$
begin
  if p_session_id is null then
    return;
  end if;
  perform pg_notify('update_session_summary', p_session_id::text);
end;
$$;

revoke all on function harvest.notify_update_session_summary(uuid) from public;
grant execute on function harvest.notify_update_session_summary(uuid) to authenticated, service_role;

-- When picker logs change, session summary changes.
create or replace function harvest.tr_notify_session_summary_from_picker_logs()
returns trigger
language plpgsql
security invoker
set search_path = harvest, public
as $$
declare
  sid uuid;
begin
  sid := coalesce(new.harvest_session_id, old.harvest_session_id);
  perform harvest.notify_update_session_summary(sid);
  return coalesce(new, old);
end;
$$;

drop trigger if exists tr_tomato_picker_logs_notify_summary on harvest.tomato_harvest_picker_logs;
create trigger tr_tomato_picker_logs_notify_summary
  after insert or update or delete on harvest.tomato_harvest_picker_logs
  for each row
  execute function harvest.tr_notify_session_summary_from_picker_logs();

-- When buyer lines or expense lines change, the dispatch (and session) summary changes.
-- We piggy-back on existing trigger flow by enhancing the dispatcher trigger to also notify.
create or replace function harvest.tr_after_sales_or_expense_touch_dispatch()
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
  perform harvest.refresh_tomato_market_dispatch_totals(did);

  select d.harvest_session_id into sid
  from harvest.tomato_market_dispatches d
  where d.id = did;

  perform harvest.notify_update_session_summary(sid);
  return coalesce(new, old);
end;
$$;

commit;

