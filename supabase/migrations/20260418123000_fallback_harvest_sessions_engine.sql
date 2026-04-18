-- Modular harvest fallback engine (non-tomato, non-french-beans).
-- Sessions: intake (direct or pickers), packaging, sales (farm/market), expenses, summary totals.
-- Market dispatch uses broker notebook (buyers + expenses) and keeps totals in sync.

begin;

-- -----------------------------------------------------------------------------
-- 1) Fallback harvest sessions
-- -----------------------------------------------------------------------------
create table if not exists harvest.fallback_harvest_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  project_id uuid not null references projects.projects(id) on delete cascade,
  crop_id uuid null,
  session_date date not null default (timezone('utc', now()))::date,

  -- Intake
  use_pickers boolean not null default false,
  unit_type text not null default 'units',
  total_units numeric not null default 0 check (total_units >= 0),

  -- Packaging
  container_type text not null default 'containers',
  total_containers numeric not null default 0 check (total_containers >= 0),

  -- Sales
  destination text not null default 'FARM' check (destination in ('FARM', 'MARKET')),
  price_per_unit numeric null check (price_per_unit is null or price_per_unit >= 0),
  auto_units_sold boolean not null default true,
  units_sold numeric null check (units_sold is null or units_sold >= 0),

  -- Totals (system-maintained)
  total_revenue numeric not null default 0 check (total_revenue >= 0),
  total_expenses numeric not null default 0 check (total_expenses >= 0),
  net_profit numeric not null default 0,

  status text not null default 'collecting' check (status in ('collecting', 'completed')),
  created_by text not null default core.current_user_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_fallback_harvest_sessions_company_project_date
  on harvest.fallback_harvest_sessions (company_id, project_id, session_date desc);

-- Optional: intake event log (direct input ledger)
create table if not exists harvest.fallback_harvest_units (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  harvest_session_id uuid not null references harvest.fallback_harvest_sessions(id) on delete cascade,
  units numeric not null check (units > 0),
  created_at timestamptz not null default now(),
  recorded_by text not null default core.current_user_id()
);

create index if not exists idx_fallback_harvest_units_session_created
  on harvest.fallback_harvest_units (harvest_session_id, created_at desc);

-- -----------------------------------------------------------------------------
-- 2) Optional picker intake (generic)
-- -----------------------------------------------------------------------------
create table if not exists harvest.fallback_session_pickers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  harvest_session_id uuid not null references harvest.fallback_harvest_sessions(id) on delete cascade,
  picker_number int not null check (picker_number > 0),
  name text not null default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (company_id, harvest_session_id, picker_number)
);

create index if not exists idx_fallback_session_pickers_session_sort
  on harvest.fallback_session_pickers (harvest_session_id, sort_order, created_at);

create table if not exists harvest.fallback_session_picker_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  harvest_session_id uuid not null references harvest.fallback_harvest_sessions(id) on delete cascade,
  picker_id uuid not null references harvest.fallback_session_pickers(id) on delete cascade,
  units numeric not null default 1 check (units > 0),
  created_at timestamptz not null default now(),
  recorded_by text not null default core.current_user_id()
);

create index if not exists idx_fallback_session_picker_logs_session_created
  on harvest.fallback_session_picker_logs (harvest_session_id, created_at desc);

-- -----------------------------------------------------------------------------
-- 3) Market dispatch + broker notebook (fallback)
-- -----------------------------------------------------------------------------
create table if not exists harvest.fallback_market_dispatches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  harvest_session_id uuid not null references harvest.fallback_harvest_sessions(id) on delete cascade,
  market_name text not null,
  broker_employee_id uuid null references public.employees(id) on delete set null,
  units_sent numeric not null default 0 check (units_sent >= 0),

  -- System totals (maintained by triggers)
  total_revenue numeric not null default 0 check (total_revenue >= 0),
  broker_sales_revenue numeric not null default 0 check (broker_sales_revenue >= 0),
  market_expenses_total numeric not null default 0 check (market_expenses_total >= 0),
  net_market_profit numeric not null default 0,

  status text not null default 'pending' check (status in ('pending', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (harvest_session_id)
);

create index if not exists idx_fallback_market_dispatches_company_session
  on harvest.fallback_market_dispatches (company_id, harvest_session_id);

create table if not exists harvest.fallback_market_sales_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  market_dispatch_id uuid not null references harvest.fallback_market_dispatches(id) on delete cascade,
  entry_number int not null check (entry_number > 0),
  buyer_label text null,
  price_per_unit numeric not null check (price_per_unit >= 0),
  quantity numeric not null check (quantity > 0),
  line_total numeric generated always as (round(price_per_unit * quantity, 2)) stored,
  created_at timestamptz not null default now(),
  unique (market_dispatch_id, entry_number)
);

create index if not exists idx_fallback_market_sales_entries_dispatch
  on harvest.fallback_market_sales_entries (market_dispatch_id, entry_number);

create table if not exists harvest.fallback_market_expense_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  market_dispatch_id uuid not null references harvest.fallback_market_dispatches(id) on delete cascade,
  category text not null,
  amount numeric not null check (amount >= 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_fallback_market_expense_lines_dispatch
  on harvest.fallback_market_expense_lines (market_dispatch_id, created_at desc);

create table if not exists harvest.fallback_market_expense_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  name text not null,
  last_used_amount numeric null check (last_used_amount is null or last_used_amount >= 0),
  usage_count int not null default 0 check (usage_count >= 0),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_fallback_market_expense_templates_company_name_norm
  on harvest.fallback_market_expense_templates (company_id, lower(trim(name)));

create index if not exists idx_fallback_market_expense_templates_company
  on harvest.fallback_market_expense_templates (company_id, usage_count desc);

-- Broker RLS helper: must be defined AFTER fallback_market_dispatches exists (PG validates function body at CREATE).
create or replace function harvest.fallback_dispatch_broker_matches_me(p_dispatch_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = harvest, public, core
as $$
  select exists (
    select 1
    from harvest.fallback_market_dispatches d
    join public.employees e on e.id = d.broker_employee_id
    where d.id = p_dispatch_id
      and e.clerk_user_id = core.current_user_id()
  );
$$;

-- -----------------------------------------------------------------------------
-- 4) updated_at triggers
-- -----------------------------------------------------------------------------
create or replace function harvest.fallback_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists tr_fallback_harvest_sessions_updated_at on harvest.fallback_harvest_sessions;
create trigger tr_fallback_harvest_sessions_updated_at
  before update on harvest.fallback_harvest_sessions
  for each row
  execute function harvest.fallback_touch_updated_at();

drop trigger if exists tr_fallback_market_dispatches_updated_at on harvest.fallback_market_dispatches;
create trigger tr_fallback_market_dispatches_updated_at
  before update on harvest.fallback_market_dispatches
  for each row
  execute function harvest.fallback_touch_updated_at();

-- -----------------------------------------------------------------------------
-- 5) Totals refresh (dispatch + session)
-- -----------------------------------------------------------------------------
create or replace function harvest.refresh_fallback_market_dispatch_totals(p_dispatch_id uuid)
returns void
language plpgsql
security definer
set search_path = harvest, public
as $$
declare
  v_sales numeric;
  v_exp numeric;
begin
  if p_dispatch_id is null then
    return;
  end if;

  select coalesce(sum(line_total), 0)::numeric into v_sales
  from harvest.fallback_market_sales_entries
  where market_dispatch_id = p_dispatch_id;

  select coalesce(sum(amount), 0)::numeric into v_exp
  from harvest.fallback_market_expense_lines
  where market_dispatch_id = p_dispatch_id;

  update harvest.fallback_market_dispatches d
  set
    broker_sales_revenue = round(coalesce(v_sales, 0), 2),
    market_expenses_total = round(coalesce(v_exp, 0), 2),
    net_market_profit = round(coalesce(v_sales, 0) - coalesce(v_exp, 0), 2),
    total_revenue = round(coalesce(v_sales, 0), 2)
  where d.id = p_dispatch_id;
end;
$$;

create or replace function harvest.refresh_fallback_session_totals(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = harvest, finance, projects, core, public
as $$
declare
  s harvest.fallback_harvest_sessions%rowtype;
  v_units numeric;
  v_rev numeric;
  v_exp numeric;
  v_dispatch_rev numeric;
begin
  if p_session_id is null then
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_session_id::text, 84));

  select * into s
  from harvest.fallback_harvest_sessions
  where id = p_session_id;

  if not found then
    return;
  end if;

  -- Units: prefer picker logs if enabled, else direct unit log sum, else stored total_units.
  if coalesce(s.use_pickers, false) then
    select coalesce(sum(l.units), 0)::numeric into v_units
    from harvest.fallback_session_picker_logs l
    where l.harvest_session_id = p_session_id;
  else
    select coalesce(sum(u.units), 0)::numeric into v_units
    from harvest.fallback_harvest_units u
    where u.harvest_session_id = p_session_id;
  end if;
  if v_units is null or v_units <= 0 then
    v_units := coalesce(s.total_units, 0);
  end if;

  if s.destination = 'MARKET' then
    select coalesce(d.total_revenue, 0)::numeric into v_dispatch_rev
    from harvest.fallback_market_dispatches d
    where d.harvest_session_id = p_session_id;
    v_rev := coalesce(v_dispatch_rev, 0);
  else
    v_rev := round(coalesce(s.price_per_unit, 0) * coalesce(
      case
        when coalesce(s.auto_units_sold, true) then v_units
        else coalesce(s.units_sold, v_units)
      end, 0
    ), 2);
  end if;

  -- Expenses: placeholder (will be expanded via expense linking + auto picker labour).
  -- For now, include any finance.expenses rows that were linked by reference_id to this session.
  select coalesce(sum(e.amount), 0)::numeric into v_exp
  from finance.expenses e
  where e.reference_id = p_session_id
    and e.deleted_at is null;

  update harvest.fallback_harvest_sessions
  set
    total_units = round(coalesce(v_units, 0), 2),
    total_revenue = round(coalesce(v_rev, 0), 2),
    total_expenses = round(coalesce(v_exp, 0), 2),
    net_profit = round(coalesce(v_rev, 0) - coalesce(v_exp, 0), 2),
    units_sold = case
      when destination = 'FARM' and coalesce(auto_units_sold, true) then round(coalesce(v_units, 0), 2)
      else units_sold
    end
  where id = p_session_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6) Triggers to keep totals in sync
-- -----------------------------------------------------------------------------
create or replace function harvest.tr_fallback_dispatch_children_refresh()
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
  perform harvest.refresh_fallback_market_dispatch_totals(did);
  select d.harvest_session_id into sid
  from harvest.fallback_market_dispatches d
  where d.id = did;
  if sid is not null then
    perform harvest.refresh_fallback_session_totals(sid);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists tr_fallback_market_sales_entries_refresh on harvest.fallback_market_sales_entries;
create trigger tr_fallback_market_sales_entries_refresh
  after insert or update or delete on harvest.fallback_market_sales_entries
  for each row
  execute function harvest.tr_fallback_dispatch_children_refresh();

drop trigger if exists tr_fallback_market_expense_lines_refresh on harvest.fallback_market_expense_lines;
create trigger tr_fallback_market_expense_lines_refresh
  after insert or update or delete on harvest.fallback_market_expense_lines
  for each row
  execute function harvest.tr_fallback_dispatch_children_refresh();

create or replace function harvest.tr_fallback_session_children_refresh()
returns trigger
language plpgsql
security invoker
set search_path = harvest, public
as $$
declare
  sid uuid;
begin
  sid := coalesce(new.harvest_session_id, old.harvest_session_id);
  perform harvest.refresh_fallback_session_totals(sid);
  return coalesce(new, old);
end;
$$;

drop trigger if exists tr_fallback_harvest_units_refresh on harvest.fallback_harvest_units;
create trigger tr_fallback_harvest_units_refresh
  after insert or update or delete on harvest.fallback_harvest_units
  for each row
  execute function harvest.tr_fallback_session_children_refresh();

drop trigger if exists tr_fallback_picker_logs_refresh on harvest.fallback_session_picker_logs;
create trigger tr_fallback_picker_logs_refresh
  after insert or update or delete on harvest.fallback_session_picker_logs
  for each row
  execute function harvest.tr_fallback_session_children_refresh();

create or replace function harvest.tr_fallback_dispatch_refresh_session()
returns trigger
language plpgsql
security invoker
set search_path = harvest, public
as $$
begin
  if tg_op = 'DELETE' then
    perform harvest.refresh_fallback_session_totals(old.harvest_session_id);
    return old;
  end if;
  perform harvest.refresh_fallback_session_totals(new.harvest_session_id);
  return new;
end;
$$;

drop trigger if exists tr_fallback_market_dispatches_refresh_session on harvest.fallback_market_dispatches;
create trigger tr_fallback_market_dispatches_refresh_session
  after insert or update or delete on harvest.fallback_market_dispatches
  for each row
  execute function harvest.tr_fallback_dispatch_refresh_session();

-- -----------------------------------------------------------------------------
-- 7) Grants + RLS
-- -----------------------------------------------------------------------------
grant select, insert, update, delete on
  harvest.fallback_harvest_sessions,
  harvest.fallback_harvest_units,
  harvest.fallback_session_pickers,
  harvest.fallback_session_picker_logs,
  harvest.fallback_market_dispatches,
  harvest.fallback_market_sales_entries,
  harvest.fallback_market_expense_lines,
  harvest.fallback_market_expense_templates
to authenticated, service_role;

alter table harvest.fallback_harvest_sessions enable row level security;
alter table harvest.fallback_harvest_units enable row level security;
alter table harvest.fallback_session_pickers enable row level security;
alter table harvest.fallback_session_picker_logs enable row level security;
alter table harvest.fallback_market_dispatches enable row level security;
alter table harvest.fallback_market_sales_entries enable row level security;
alter table harvest.fallback_market_expense_lines enable row level security;
alter table harvest.fallback_market_expense_templates enable row level security;

-- Sessions
drop policy if exists fallback_harvest_sessions_select on harvest.fallback_harvest_sessions;
create policy fallback_harvest_sessions_select
  on harvest.fallback_harvest_sessions
  for select
  using (
    public.is_developer()
    or (
      core.is_company_member(company_id)
      and exists (
        select 1
        from projects.projects p
        where p.id = fallback_harvest_sessions.project_id
          and p.deleted_at is null
      )
    )
  );

drop policy if exists fallback_harvest_sessions_insert on harvest.fallback_harvest_sessions;
create policy fallback_harvest_sessions_insert
  on harvest.fallback_harvest_sessions
  for insert
  with check (
    core.is_company_member(company_id)
    and created_by = core.current_user_id()
    and exists (
      select 1
      from projects.projects p
      where p.id = fallback_harvest_sessions.project_id
        and p.deleted_at is null
    )
  );

drop policy if exists fallback_harvest_sessions_update on harvest.fallback_harvest_sessions;
create policy fallback_harvest_sessions_update
  on harvest.fallback_harvest_sessions
  for update
  using (
    public.is_developer()
    or (core.is_company_member(company_id) and (core.is_company_admin(company_id) or created_by = core.current_user_id()))
  )
  with check (
    public.is_developer()
    or (core.is_company_member(company_id) and (core.is_company_admin(company_id) or created_by = core.current_user_id()))
  );

-- Children: inherit session access
drop policy if exists fallback_harvest_units_select on harvest.fallback_harvest_units;
create policy fallback_harvest_units_select
  on harvest.fallback_harvest_units
  for select
  using (
    public.is_developer()
    or exists (
      select 1
      from harvest.fallback_harvest_sessions s
      join projects.projects p on p.id = s.project_id
      where s.id = fallback_harvest_units.harvest_session_id
        and p.deleted_at is null
        and core.is_company_member(s.company_id)
    )
  );

drop policy if exists fallback_harvest_units_write on harvest.fallback_harvest_units;
create policy fallback_harvest_units_write
  on harvest.fallback_harvest_units
  for all
  using (
    public.is_developer()
    or exists (
      select 1
      from harvest.fallback_harvest_sessions s
      where s.id = fallback_harvest_units.harvest_session_id
        and core.is_company_member(s.company_id)
    )
  )
  with check (
    public.is_developer()
    or exists (
      select 1
      from harvest.fallback_harvest_sessions s
      where s.id = fallback_harvest_units.harvest_session_id
        and core.is_company_member(s.company_id)
    )
  );

-- Pickers/logs: same session member access
drop policy if exists fallback_session_pickers_select on harvest.fallback_session_pickers;
create policy fallback_session_pickers_select
  on harvest.fallback_session_pickers
  for select
  using (
    public.is_developer()
    or exists (
      select 1
      from harvest.fallback_harvest_sessions s
      join projects.projects p on p.id = s.project_id
      where s.id = fallback_session_pickers.harvest_session_id
        and p.deleted_at is null
        and core.is_company_member(s.company_id)
    )
  );

drop policy if exists fallback_session_pickers_write on harvest.fallback_session_pickers;
create policy fallback_session_pickers_write
  on harvest.fallback_session_pickers
  for all
  using (public.is_developer() or core.is_company_member(company_id))
  with check (public.is_developer() or core.is_company_member(company_id));

drop policy if exists fallback_session_picker_logs_select on harvest.fallback_session_picker_logs;
create policy fallback_session_picker_logs_select
  on harvest.fallback_session_picker_logs
  for select
  using (
    public.is_developer()
    or exists (
      select 1
      from harvest.fallback_harvest_sessions s
      join projects.projects p on p.id = s.project_id
      where s.id = fallback_session_picker_logs.harvest_session_id
        and p.deleted_at is null
        and core.is_company_member(s.company_id)
    )
  );

drop policy if exists fallback_session_picker_logs_write on harvest.fallback_session_picker_logs;
create policy fallback_session_picker_logs_write
  on harvest.fallback_session_picker_logs
  for all
  using (public.is_developer() or core.is_company_member(company_id))
  with check (public.is_developer() or core.is_company_member(company_id));

-- Dispatches: company members OR assigned broker
drop policy if exists fallback_market_dispatches_select on harvest.fallback_market_dispatches;
create policy fallback_market_dispatches_select
  on harvest.fallback_market_dispatches
  for select
  using (
    public.is_developer()
    or core.is_company_member(company_id)
    or harvest.fallback_dispatch_broker_matches_me(id)
  );

drop policy if exists fallback_market_dispatches_write on harvest.fallback_market_dispatches;
create policy fallback_market_dispatches_write
  on harvest.fallback_market_dispatches
  for all
  using (
    public.is_developer()
    or (core.is_company_member(company_id) and core.is_company_admin(company_id))
    or harvest.fallback_dispatch_broker_matches_me(id)
  )
  with check (
    public.is_developer()
    or (core.is_company_member(company_id) and core.is_company_admin(company_id))
    or harvest.fallback_dispatch_broker_matches_me(id)
  );

-- Sales entries: company members OR assigned broker for the parent dispatch
drop policy if exists fallback_market_sales_entries_select on harvest.fallback_market_sales_entries;
create policy fallback_market_sales_entries_select
  on harvest.fallback_market_sales_entries
  for select
  using (
    public.is_developer()
    or core.is_company_member(company_id)
    or harvest.fallback_dispatch_broker_matches_me(market_dispatch_id)
  );

drop policy if exists fallback_market_sales_entries_write on harvest.fallback_market_sales_entries;
create policy fallback_market_sales_entries_write
  on harvest.fallback_market_sales_entries
  for all
  using (
    public.is_developer()
    or (core.is_company_member(company_id) and core.is_company_admin(company_id))
    or harvest.fallback_dispatch_broker_matches_me(market_dispatch_id)
  )
  with check (
    public.is_developer()
    or (core.is_company_member(company_id) and core.is_company_admin(company_id))
    or harvest.fallback_dispatch_broker_matches_me(market_dispatch_id)
  );

-- Expense lines: same as sales entries
drop policy if exists fallback_market_expense_lines_select on harvest.fallback_market_expense_lines;
create policy fallback_market_expense_lines_select
  on harvest.fallback_market_expense_lines
  for select
  using (
    public.is_developer()
    or core.is_company_member(company_id)
    or harvest.fallback_dispatch_broker_matches_me(market_dispatch_id)
  );

drop policy if exists fallback_market_expense_lines_write on harvest.fallback_market_expense_lines;
create policy fallback_market_expense_lines_write
  on harvest.fallback_market_expense_lines
  for all
  using (
    public.is_developer()
    or (core.is_company_member(company_id) and core.is_company_admin(company_id))
    or harvest.fallback_dispatch_broker_matches_me(market_dispatch_id)
  )
  with check (
    public.is_developer()
    or (core.is_company_member(company_id) and core.is_company_admin(company_id))
    or harvest.fallback_dispatch_broker_matches_me(market_dispatch_id)
  );

-- Templates: company member only
drop policy if exists fallback_market_expense_templates_select on harvest.fallback_market_expense_templates;
create policy fallback_market_expense_templates_select
  on harvest.fallback_market_expense_templates
  for select
  using (public.is_developer() or core.is_company_member(company_id));

drop policy if exists fallback_market_expense_templates_write on harvest.fallback_market_expense_templates;
create policy fallback_market_expense_templates_write
  on harvest.fallback_market_expense_templates
  for all
  using (public.is_developer() or core.is_company_member(company_id))
  with check (public.is_developer() or core.is_company_member(company_id));

-- -----------------------------------------------------------------------------
-- 8) Realtime publication (best-effort)
-- -----------------------------------------------------------------------------
do $realtime$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'harvest'
        and tablename = 'fallback_harvest_sessions'
    ) then
      execute 'alter publication supabase_realtime add table harvest.fallback_harvest_sessions';
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'harvest'
        and tablename = 'fallback_market_dispatches'
    ) then
      execute 'alter publication supabase_realtime add table harvest.fallback_market_dispatches';
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'harvest'
        and tablename = 'fallback_market_sales_entries'
    ) then
      execute 'alter publication supabase_realtime add table harvest.fallback_market_sales_entries';
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'harvest'
        and tablename = 'fallback_market_expense_lines'
    ) then
      execute 'alter publication supabase_realtime add table harvest.fallback_market_expense_lines';
    end if;
  end if;
end
$realtime$;

commit;

