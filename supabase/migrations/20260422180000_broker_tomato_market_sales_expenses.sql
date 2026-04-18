-- Broker market notebook: per-dispatch buyer lines + market expenses, RLS by assigned employee, live dispatch totals.

begin;

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
create or replace function harvest.user_is_sales_broker_in_company(p_company uuid)
returns boolean
language sql
stable
security invoker
set search_path = public, core
as $$
  select exists (
    select 1
    from public.employees e
    where e.company_id = p_company
      and e.clerk_user_id = core.current_user_id()
      and lower(coalesce(e.role, '')) in ('sales-broker', 'broker')
  );
$$;

create or replace function harvest.dispatch_broker_matches_me(p_dispatch_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = harvest, public, core
as $$
  select exists (
    select 1
    from harvest.tomato_market_dispatches d
    join public.employees e on e.id = d.broker_employee_id
    where d.id = p_dispatch_id
      and e.clerk_user_id = core.current_user_id()
  );
$$;

-- -----------------------------------------------------------------------------
-- Dispatch financial columns
-- -----------------------------------------------------------------------------
alter table harvest.tomato_market_dispatches
  add column if not exists broker_sales_revenue numeric not null default 0 check (broker_sales_revenue >= 0);

alter table harvest.tomato_market_dispatches
  add column if not exists market_expenses_total numeric not null default 0 check (market_expenses_total >= 0);

alter table harvest.tomato_market_dispatches
  add column if not exists net_market_profit numeric not null default 0;

comment on column harvest.tomato_market_dispatches.broker_sales_revenue is 'Sum of broker buyer lines (crates × price).';
comment on column harvest.tomato_market_dispatches.market_expenses_total is 'Sum of broker-recorded market expense lines.';
comment on column harvest.tomato_market_dispatches.net_market_profit is 'broker_sales_revenue - market_expenses_total.';

-- -----------------------------------------------------------------------------
-- Sales entries (buyers notebook)
-- -----------------------------------------------------------------------------
create table if not exists harvest.tomato_market_sales_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  market_dispatch_id uuid not null references harvest.tomato_market_dispatches(id) on delete cascade,
  entry_number int not null check (entry_number > 0),
  buyer_label text null,
  price_per_unit numeric not null check (price_per_unit >= 0),
  quantity int not null check (quantity > 0),
  line_total numeric generated always as (round(price_per_unit * quantity::numeric, 2)) stored,
  created_at timestamptz not null default now(),
  unique (market_dispatch_id, entry_number)
);

create index if not exists idx_tomato_market_sales_entries_dispatch
  on harvest.tomato_market_sales_entries (market_dispatch_id, entry_number);

-- -----------------------------------------------------------------------------
-- Market expense lines (broker)
-- -----------------------------------------------------------------------------
create table if not exists harvest.tomato_market_expense_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  market_dispatch_id uuid not null references harvest.tomato_market_dispatches(id) on delete cascade,
  category text not null,
  amount numeric not null check (amount >= 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_tomato_market_expense_lines_dispatch
  on harvest.tomato_market_expense_lines (market_dispatch_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Expense name templates (autocomplete)
-- -----------------------------------------------------------------------------
create table if not exists harvest.tomato_market_expense_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  name text not null,
  last_used_amount numeric null check (last_used_amount is null or last_used_amount >= 0),
  usage_count int not null default 0 check (usage_count >= 0),
  updated_at timestamptz not null default now()
);

-- Expression uniqueness is not valid in a table UNIQUE constraint; use a unique index.
create unique index if not exists uq_tomato_market_expense_templates_company_name_norm
  on harvest.tomato_market_expense_templates (company_id, lower(trim(name)));

create index if not exists idx_tomato_market_expense_templates_company
  on harvest.tomato_market_expense_templates (company_id, usage_count desc);

-- -----------------------------------------------------------------------------
-- Refresh dispatch totals (security definer for trigger)
-- -----------------------------------------------------------------------------
create or replace function harvest.refresh_tomato_market_dispatch_totals(p_dispatch_id uuid)
returns void
language plpgsql
security definer
set search_path = harvest, public
as $$
declare
  v_sales numeric;
  v_exp numeric;
  v_cnt int;
  v_tr_prev numeric;
begin
  if p_dispatch_id is null then
    return;
  end if;

  select count(*)::int into v_cnt
  from harvest.tomato_market_sales_entries
  where market_dispatch_id = p_dispatch_id;

  select coalesce(sum(line_total), 0)::numeric into v_sales
  from harvest.tomato_market_sales_entries
  where market_dispatch_id = p_dispatch_id;

  select coalesce(sum(amount), 0)::numeric into v_exp
  from harvest.tomato_market_expense_lines
  where market_dispatch_id = p_dispatch_id;

  select total_revenue into v_tr_prev
  from harvest.tomato_market_dispatches
  where id = p_dispatch_id;

  update harvest.tomato_market_dispatches d
  set
    broker_sales_revenue = coalesce(v_sales, 0),
    market_expenses_total = coalesce(v_exp, 0),
    net_market_profit = round(coalesce(v_sales, 0) - coalesce(v_exp, 0), 2),
    total_revenue = case
      when v_cnt > 0 then round(coalesce(v_sales, 0), 2)
      else v_tr_prev
    end,
    updated_at = now()
  where d.id = p_dispatch_id;
end;
$$;

revoke all on function harvest.refresh_tomato_market_dispatch_totals(uuid) from public;
grant execute on function harvest.refresh_tomato_market_dispatch_totals(uuid) to authenticated, service_role;

create or replace function harvest.tr_after_sales_or_expense_touch_dispatch()
returns trigger
language plpgsql
security invoker
set search_path = harvest, public
as $$
declare
  did uuid;
begin
  did := coalesce(new.market_dispatch_id, old.market_dispatch_id);
  perform harvest.refresh_tomato_market_dispatch_totals(did);
  return coalesce(new, old);
end;
$$;

drop trigger if exists tr_tomato_market_sales_entries_refresh on harvest.tomato_market_sales_entries;
create trigger tr_tomato_market_sales_entries_refresh
  after insert or update or delete on harvest.tomato_market_sales_entries
  for each row
  execute function harvest.tr_after_sales_or_expense_touch_dispatch();

drop trigger if exists tr_tomato_market_expense_lines_refresh on harvest.tomato_market_expense_lines;
create trigger tr_tomato_market_expense_lines_refresh
  after insert or update or delete on harvest.tomato_market_expense_lines
  for each row
  execute function harvest.tr_after_sales_or_expense_touch_dispatch();

-- Default company_id from parent dispatch
create or replace function harvest.tomato_market_child_set_company()
returns trigger
language plpgsql
security invoker
set search_path = harvest, public
as $$
begin
  if new.company_id is null or new.company_id is distinct from (
    select d.company_id from harvest.tomato_market_dispatches d where d.id = new.market_dispatch_id
  ) then
    select d.company_id into new.company_id
    from harvest.tomato_market_dispatches d
    where d.id = new.market_dispatch_id;
  end if;
  return new;
end;
$$;

drop trigger if exists tr_tomato_market_sales_entries_company on harvest.tomato_market_sales_entries;
create trigger tr_tomato_market_sales_entries_company
  before insert or update on harvest.tomato_market_sales_entries
  for each row
  execute function harvest.tomato_market_child_set_company();

drop trigger if exists tr_tomato_market_expense_lines_company on harvest.tomato_market_expense_lines;
create trigger tr_tomato_market_expense_lines_company
  before insert or update on harvest.tomato_market_expense_lines
  for each row
  execute function harvest.tomato_market_child_set_company();

-- Auto entry_number when 0 or null
create or replace function harvest.tomato_market_sales_entries_next_number()
returns trigger
language plpgsql
security invoker
set search_path = harvest, public
as $$
declare
  v_next int;
begin
  if new.entry_number is null or new.entry_number <= 0 then
    select coalesce(max(entry_number), 0) + 1 into v_next
    from harvest.tomato_market_sales_entries
    where market_dispatch_id = new.market_dispatch_id;
    new.entry_number := v_next;
  end if;
  return new;
end;
$$;

drop trigger if exists tr_tomato_market_sales_entries_entry_no on harvest.tomato_market_sales_entries;
create trigger tr_tomato_market_sales_entries_entry_no
  before insert on harvest.tomato_market_sales_entries
  for each row
  execute function harvest.tomato_market_sales_entries_next_number();

-- Brokers cannot change protected dispatch fields (only status / timestamps flow through)
create or replace function harvest.tomato_market_dispatches_broker_field_lock()
returns trigger
language plpgsql
security invoker
set search_path = harvest, public, core
as $$
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;
  if public.is_developer() or core.is_company_admin(new.company_id) then
    return new;
  end if;
  if not harvest.user_is_sales_broker_in_company(new.company_id) then
    return new;
  end if;
  if not harvest.dispatch_broker_matches_me(new.id) then
    return new;
  end if;
  new.harvest_session_id := old.harvest_session_id;
  new.company_id := old.company_id;
  new.broker_employee_id := old.broker_employee_id;
  new.market_name := old.market_name;
  new.containers_sent := old.containers_sent;
  new.price_per_container := old.price_per_container;
  new.broker_sales_revenue := old.broker_sales_revenue;
  new.market_expenses_total := old.market_expenses_total;
  new.net_market_profit := old.net_market_profit;
  new.total_revenue := old.total_revenue;
  new.created_at := old.created_at;
  return new;
end;
$$;

drop trigger if exists tr_tomato_market_dispatches_broker_lock on harvest.tomato_market_dispatches;
create trigger tr_tomato_market_dispatches_broker_lock
  before update on harvest.tomato_market_dispatches
  for each row
  execute function harvest.tomato_market_dispatches_broker_field_lock();

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
grant select, insert, update, delete on harvest.tomato_market_sales_entries to authenticated, service_role;
grant select, insert, update, delete on harvest.tomato_market_expense_lines to authenticated, service_role;
grant select, insert, update, delete on harvest.tomato_market_expense_templates to authenticated, service_role;

alter table harvest.tomato_market_sales_entries enable row level security;
alter table harvest.tomato_market_expense_lines enable row level security;
alter table harvest.tomato_market_expense_templates enable row level security;

-- -----------------------------------------------------------------------------
-- RLS: tomato_market_dispatches (replace broad member SELECT)
-- -----------------------------------------------------------------------------
drop policy if exists tomato_market_dispatches_select on harvest.tomato_market_dispatches;

create policy tomato_market_dispatches_select_admin
  on harvest.tomato_market_dispatches
  for select
  using (
    public.is_developer()
    or (
      core.is_company_member(company_id)
      and core.is_company_admin(company_id)
      and exists (
        select 1
        from harvest.tomato_harvest_sessions s
        join projects.projects p on p.id = s.project_id
        where s.id = harvest_session_id
          and p.deleted_at is null
      )
    )
  );

create policy tomato_market_dispatches_select_staff
  on harvest.tomato_market_dispatches
  for select
  using (
    core.is_company_member(company_id)
    and exists (
      select 1
      from harvest.tomato_harvest_sessions s
      join projects.projects p on p.id = s.project_id
      where s.id = harvest_session_id
        and p.deleted_at is null
    )
    and not harvest.user_is_sales_broker_in_company(company_id)
  );

create policy tomato_market_dispatches_select_broker
  on harvest.tomato_market_dispatches
  for select
  using (
    core.is_company_member(company_id)
    and harvest.user_is_sales_broker_in_company(company_id)
    and harvest.dispatch_broker_matches_me(id)
    and exists (
      select 1
      from harvest.tomato_harvest_sessions s
      join projects.projects p on p.id = s.project_id
      where s.id = harvest_session_id
        and p.deleted_at is null
    )
  );

drop policy if exists tomato_market_dispatches_update on harvest.tomato_market_dispatches;

create policy tomato_market_dispatches_update_admin
  on harvest.tomato_market_dispatches
  for update
  using (
    public.is_developer()
    or (
      core.is_company_member(company_id)
      and core.is_company_admin(company_id)
    )
  )
  with check (
    public.is_developer()
    or (
      core.is_company_member(company_id)
      and core.is_company_admin(company_id)
    )
  );

create policy tomato_market_dispatches_update_broker
  on harvest.tomato_market_dispatches
  for update
  using (
    core.is_company_member(company_id)
    and harvest.user_is_sales_broker_in_company(company_id)
    and harvest.dispatch_broker_matches_me(id)
  )
  with check (
    core.is_company_member(company_id)
    and harvest.user_is_sales_broker_in_company(company_id)
    and harvest.dispatch_broker_matches_me(id)
  );

-- -----------------------------------------------------------------------------
-- RLS: sales entries
-- -----------------------------------------------------------------------------
drop policy if exists tomato_market_sales_entries_select on harvest.tomato_market_sales_entries;
create policy tomato_market_sales_entries_select
  on harvest.tomato_market_sales_entries
  for select
  using (
    public.is_developer()
    or (
      core.is_company_member(company_id)
      and (
        core.is_company_admin(company_id)
        or not harvest.user_is_sales_broker_in_company(company_id)
        or harvest.dispatch_broker_matches_me(market_dispatch_id)
      )
    )
  );

drop policy if exists tomato_market_sales_entries_insert on harvest.tomato_market_sales_entries;
create policy tomato_market_sales_entries_insert
  on harvest.tomato_market_sales_entries
  for insert
  with check (
    core.is_company_member(company_id)
    and (
      core.is_company_admin(company_id)
      or not harvest.user_is_sales_broker_in_company(company_id)
      or harvest.dispatch_broker_matches_me(market_dispatch_id)
    )
  );

drop policy if exists tomato_market_sales_entries_update on harvest.tomato_market_sales_entries;
create policy tomato_market_sales_entries_update
  on harvest.tomato_market_sales_entries
  for update
  using (
    core.is_company_member(company_id)
    and (
      core.is_company_admin(company_id)
      or not harvest.user_is_sales_broker_in_company(company_id)
      or harvest.dispatch_broker_matches_me(market_dispatch_id)
    )
  )
  with check (
    core.is_company_member(company_id)
    and (
      core.is_company_admin(company_id)
      or not harvest.user_is_sales_broker_in_company(company_id)
      or harvest.dispatch_broker_matches_me(market_dispatch_id)
    )
  );

drop policy if exists tomato_market_sales_entries_delete on harvest.tomato_market_sales_entries;
create policy tomato_market_sales_entries_delete
  on harvest.tomato_market_sales_entries
  for delete
  using (
    core.is_company_member(company_id)
    and (
      core.is_company_admin(company_id)
      or not harvest.user_is_sales_broker_in_company(company_id)
      or harvest.dispatch_broker_matches_me(market_dispatch_id)
    )
  );

-- -----------------------------------------------------------------------------
-- RLS: expense lines (same pattern)
-- -----------------------------------------------------------------------------
drop policy if exists tomato_market_expense_lines_select on harvest.tomato_market_expense_lines;
create policy tomato_market_expense_lines_select
  on harvest.tomato_market_expense_lines
  for select
  using (
    public.is_developer()
    or (
      core.is_company_member(company_id)
      and (
        core.is_company_admin(company_id)
        or not harvest.user_is_sales_broker_in_company(company_id)
        or harvest.dispatch_broker_matches_me(market_dispatch_id)
      )
    )
  );

drop policy if exists tomato_market_expense_lines_insert on harvest.tomato_market_expense_lines;
create policy tomato_market_expense_lines_insert
  on harvest.tomato_market_expense_lines
  for insert
  with check (
    core.is_company_member(company_id)
    and (
      core.is_company_admin(company_id)
      or not harvest.user_is_sales_broker_in_company(company_id)
      or harvest.dispatch_broker_matches_me(market_dispatch_id)
    )
  );

drop policy if exists tomato_market_expense_lines_update on harvest.tomato_market_expense_lines;
create policy tomato_market_expense_lines_update
  on harvest.tomato_market_expense_lines
  for update
  using (
    core.is_company_member(company_id)
    and (
      core.is_company_admin(company_id)
      or not harvest.user_is_sales_broker_in_company(company_id)
      or harvest.dispatch_broker_matches_me(market_dispatch_id)
    )
  )
  with check (
    core.is_company_member(company_id)
    and (
      core.is_company_admin(company_id)
      or not harvest.user_is_sales_broker_in_company(company_id)
      or harvest.dispatch_broker_matches_me(market_dispatch_id)
    )
  );

drop policy if exists tomato_market_expense_lines_delete on harvest.tomato_market_expense_lines;
create policy tomato_market_expense_lines_delete
  on harvest.tomato_market_expense_lines
  for delete
  using (
    core.is_company_member(company_id)
    and (
      core.is_company_admin(company_id)
      or not harvest.user_is_sales_broker_in_company(company_id)
      or harvest.dispatch_broker_matches_me(market_dispatch_id)
    )
  );

-- -----------------------------------------------------------------------------
-- RLS: templates (company-wide; brokers are members)
-- -----------------------------------------------------------------------------
drop policy if exists tomato_market_expense_templates_select on harvest.tomato_market_expense_templates;
create policy tomato_market_expense_templates_select
  on harvest.tomato_market_expense_templates
  for select
  using (public.is_developer() or core.is_company_member(company_id));

drop policy if exists tomato_market_expense_templates_insert on harvest.tomato_market_expense_templates;
create policy tomato_market_expense_templates_insert
  on harvest.tomato_market_expense_templates
  for insert
  with check (core.is_company_member(company_id));

drop policy if exists tomato_market_expense_templates_update on harvest.tomato_market_expense_templates;
create policy tomato_market_expense_templates_update
  on harvest.tomato_market_expense_templates
  for update
  using (public.is_developer() or core.is_company_member(company_id))
  with check (core.is_company_member(company_id));

drop policy if exists tomato_market_expense_templates_delete on harvest.tomato_market_expense_templates;
create policy tomato_market_expense_templates_delete
  on harvest.tomato_market_expense_templates
  for delete
  using (public.is_developer() or core.is_company_admin(company_id));

-- -----------------------------------------------------------------------------
-- Extend company tomato aggregate (market expenses rollup)
-- -----------------------------------------------------------------------------
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
      d.price_per_container as d_price,
      d.containers_sent as d_containers,
      coalesce(d.market_expenses_total, 0)::numeric as d_market_exp
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
            when d_status = 'completed' then
              coalesce(
                case when d_total_revenue is not null and d_total_revenue >= 0 then d_total_revenue::numeric end,
                case
                  when d_price is not null and coalesce(d_containers, 0) > 0
                  then (d_price * d_containers)::numeric
                end,
                0::numeric
              )
            when d_id is not null then 0::numeric
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
      case when sale_mode = 'market' and d_id is not null then coalesce(d_market_exp, 0) else 0::numeric end as mexp
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

-- -----------------------------------------------------------------------------
-- List summaries RPC — include broker financial columns on dispatch
-- -----------------------------------------------------------------------------
drop function if exists harvest.tomato_harvest_sessions_summaries_for_project(uuid, uuid);

create function harvest.tomato_harvest_sessions_summaries_for_project(
  p_company_id uuid,
  p_project_id uuid
)
returns table (
  id uuid,
  company_id uuid,
  project_id uuid,
  crop_id uuid,
  harvest_number integer,
  session_date date,
  packaging_type text,
  packaging_count integer,
  sale_mode text,
  price_per_container numeric,
  sale_units integer,
  total_revenue numeric,
  picker_rate_per_bucket numeric,
  status text,
  created_by text,
  created_at timestamptz,
  updated_at timestamptz,
  total_buckets bigint,
  picker_count bigint,
  md_id uuid,
  md_status text,
  md_market_name text,
  md_broker_employee_id uuid,
  md_containers_sent integer,
  md_price_per_container numeric,
  md_total_revenue numeric,
  md_broker_sales_revenue numeric,
  md_market_expenses_total numeric,
  md_net_market_profit numeric
)
language sql
stable
set search_path = harvest, public
as $$
  select
    s.id,
    s.company_id,
    s.project_id,
    s.crop_id,
    s.harvest_number,
    s.session_date,
    s.packaging_type,
    s.packaging_count,
    s.sale_mode,
    s.price_per_container,
    s.sale_units,
    s.total_revenue,
    s.picker_rate_per_bucket,
    s.status,
    s.created_by,
    s.created_at,
    s.updated_at,
    coalesce(b.total_buckets, 0)::bigint,
    coalesce(pc.picker_count, 0)::bigint,
    d.id,
    d.status,
    d.market_name,
    d.broker_employee_id,
    d.containers_sent,
    d.price_per_container,
    d.total_revenue,
    coalesce(d.broker_sales_revenue, 0)::numeric,
    coalesce(d.market_expenses_total, 0)::numeric,
    coalesce(d.net_market_profit, 0)::numeric
  from harvest.tomato_harvest_sessions s
  left join harvest.tomato_market_dispatches d
    on d.harvest_session_id = s.id
    and d.company_id = s.company_id
  left join (
    select harvest_session_id, sum(units)::bigint as total_buckets
    from harvest.tomato_harvest_picker_logs
    where company_id = p_company_id
    group by harvest_session_id
  ) b on b.harvest_session_id = s.id
  left join (
    select harvest_session_id, count(*)::bigint as picker_count
    from harvest.tomato_harvest_pickers
    where company_id = p_company_id
    group by harvest_session_id
  ) pc on pc.harvest_session_id = s.id
  where s.company_id = p_company_id
    and s.project_id = p_project_id
  order by s.session_date desc, s.harvest_number desc;
$$;

grant execute on function harvest.tomato_harvest_sessions_summaries_for_project(uuid, uuid) to authenticated;
grant execute on function harvest.tomato_harvest_sessions_summaries_for_project(uuid, uuid) to service_role;

-- Backfill dispatch totals
do $$
declare
  r record;
begin
  for r in select id from harvest.tomato_market_dispatches
  loop
    perform harvest.refresh_tomato_market_dispatch_totals(r.id);
  end loop;
end$$;

-- -----------------------------------------------------------------------------
-- Realtime
-- -----------------------------------------------------------------------------
do $realtime$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'harvest'
        and tablename = 'tomato_market_sales_entries'
    ) then
      execute 'alter publication supabase_realtime add table harvest.tomato_market_sales_entries';
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'harvest'
        and tablename = 'tomato_market_expense_lines'
    ) then
      execute 'alter publication supabase_realtime add table harvest.tomato_market_expense_lines';
    end if;
  end if;
end
$realtime$;

commit;
