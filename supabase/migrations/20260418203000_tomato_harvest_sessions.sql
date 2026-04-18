-- Tomato harvest sessions: picker bucket intake, packaging counts, sales (FarmVault).
-- Tables: harvest.tomato_harvest_sessions, harvest.tomato_harvest_pickers, harvest.tomato_harvest_picker_logs
-- RLS mirrors harvest.harvest_collections + children; realtime on picker logs.

begin;

-- -----------------------------------------------------------------------------
-- 1) Tables
-- -----------------------------------------------------------------------------

create table if not exists harvest.tomato_harvest_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  project_id uuid not null references projects.projects(id) on delete cascade,
  crop_id uuid null,
  harvest_number int not null,
  session_date date not null default (timezone('utc', now()))::date,
  packaging_type text null,
  packaging_count int not null default 0 check (packaging_count >= 0),
  sale_mode text null check (sale_mode is null or sale_mode in ('farm_gate', 'market')),
  price_per_container numeric null check (price_per_container is null or price_per_container >= 0),
  sale_units int null check (sale_units is null or sale_units >= 0),
  total_revenue numeric null check (total_revenue is null or total_revenue >= 0),
  picker_rate_per_bucket numeric not null default 30 check (picker_rate_per_bucket >= 0),
  status text not null default 'collecting' check (status in ('collecting', 'completed')),
  created_by text not null default core.current_user_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, harvest_number)
);

create index if not exists idx_tomato_harvest_sessions_company_project_date
  on harvest.tomato_harvest_sessions (company_id, project_id, session_date desc);

create table if not exists harvest.tomato_harvest_pickers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  harvest_session_id uuid not null references harvest.tomato_harvest_sessions(id) on delete cascade,
  picker_number int not null check (picker_number > 0),
  name text not null default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (company_id, harvest_session_id, picker_number)
);

create index if not exists idx_tomato_harvest_pickers_session_sort
  on harvest.tomato_harvest_pickers (harvest_session_id, sort_order, created_at);

create table if not exists harvest.tomato_harvest_picker_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  harvest_session_id uuid not null references harvest.tomato_harvest_sessions(id) on delete cascade,
  picker_id uuid not null references harvest.tomato_harvest_pickers(id) on delete cascade,
  units int not null default 1 check (units > 0),
  created_at timestamptz not null default now(),
  recorded_by text not null default core.current_user_id()
);

create index if not exists idx_tomato_harvest_picker_logs_session_created
  on harvest.tomato_harvest_picker_logs (harvest_session_id, created_at desc);

-- -----------------------------------------------------------------------------
-- 2) updated_at on sessions
-- -----------------------------------------------------------------------------

create or replace function harvest.tomato_harvest_sessions_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists tr_tomato_harvest_sessions_updated_at on harvest.tomato_harvest_sessions;
create trigger tr_tomato_harvest_sessions_updated_at
  before update on harvest.tomato_harvest_sessions
  for each row
  execute function harvest.tomato_harvest_sessions_touch_updated_at();

-- -----------------------------------------------------------------------------
-- 3) Grants
-- -----------------------------------------------------------------------------

grant select, insert, update, delete on harvest.tomato_harvest_sessions to authenticated, service_role;
grant select, insert, update, delete on harvest.tomato_harvest_pickers to authenticated, service_role;
grant select, insert, update, delete on harvest.tomato_harvest_picker_logs to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4) RLS
-- -----------------------------------------------------------------------------

alter table harvest.tomato_harvest_sessions enable row level security;
alter table harvest.tomato_harvest_pickers enable row level security;
alter table harvest.tomato_harvest_picker_logs enable row level security;

-- Sessions: select
drop policy if exists tomato_harvest_sessions_select on harvest.tomato_harvest_sessions;
create policy tomato_harvest_sessions_select
  on harvest.tomato_harvest_sessions
  for select
  using (
    public.is_developer()
    or (
      core.is_company_member(company_id)
      and exists (
        select 1
        from projects.projects p
        where p.id = tomato_harvest_sessions.project_id
          and p.deleted_at is null
      )
    )
  );

-- Sessions: insert
drop policy if exists tomato_harvest_sessions_insert on harvest.tomato_harvest_sessions;
create policy tomato_harvest_sessions_insert
  on harvest.tomato_harvest_sessions
  for insert
  with check (
    core.is_company_member(company_id)
    and created_by = core.current_user_id()
    and exists (
      select 1
      from projects.projects p
      where p.id = tomato_harvest_sessions.project_id
        and p.deleted_at is null
    )
  );

-- Sessions: update
drop policy if exists tomato_harvest_sessions_update on harvest.tomato_harvest_sessions;
create policy tomato_harvest_sessions_update
  on harvest.tomato_harvest_sessions
  for update
  using (
    public.is_developer()
    or (
      core.is_company_member(company_id)
      and (core.is_company_admin(company_id) or created_by = core.current_user_id())
    )
  )
  with check (
    public.is_developer()
    or (
      core.is_company_member(company_id)
      and (core.is_company_admin(company_id) or created_by = core.current_user_id())
    )
  );

-- Pickers: select
drop policy if exists tomato_harvest_pickers_select on harvest.tomato_harvest_pickers;
create policy tomato_harvest_pickers_select
  on harvest.tomato_harvest_pickers
  for select
  using (
    public.is_developer()
    or (
      core.is_company_member(company_id)
      and exists (
        select 1
        from harvest.tomato_harvest_sessions s
        join projects.projects p on p.id = s.project_id
        where s.id = tomato_harvest_pickers.harvest_session_id
          and p.deleted_at is null
      )
    )
  );

-- Pickers: insert
drop policy if exists tomato_harvest_pickers_insert on harvest.tomato_harvest_pickers;
create policy tomato_harvest_pickers_insert
  on harvest.tomato_harvest_pickers
  for insert
  with check (
    core.is_company_member(company_id)
    and exists (
      select 1
      from harvest.tomato_harvest_sessions s
      join projects.projects p on p.id = s.project_id
      where s.id = tomato_harvest_pickers.harvest_session_id
        and p.deleted_at is null
    )
  );

-- Pickers: update (name / sort_order only expected)
drop policy if exists tomato_harvest_pickers_update on harvest.tomato_harvest_pickers;
create policy tomato_harvest_pickers_update
  on harvest.tomato_harvest_pickers
  for update
  using (
    public.is_developer()
    or core.is_company_member(company_id)
  )
  with check (
    public.is_developer()
    or core.is_company_member(company_id)
  );

-- Pickers: delete (optional cleanup)
drop policy if exists tomato_harvest_pickers_delete on harvest.tomato_harvest_pickers;
create policy tomato_harvest_pickers_delete
  on harvest.tomato_harvest_pickers
  for delete
  using (
    public.is_developer()
    or (
      core.is_company_member(company_id)
      and core.is_company_admin(company_id)
    )
  );

-- Logs: select
drop policy if exists tomato_harvest_picker_logs_select on harvest.tomato_harvest_picker_logs;
create policy tomato_harvest_picker_logs_select
  on harvest.tomato_harvest_picker_logs
  for select
  using (
    public.is_developer()
    or (
      core.is_company_member(company_id)
      and exists (
        select 1
        from harvest.tomato_harvest_sessions s
        join projects.projects p on p.id = s.project_id
        where s.id = tomato_harvest_picker_logs.harvest_session_id
          and p.deleted_at is null
      )
    )
  );

-- Logs: insert
drop policy if exists tomato_harvest_picker_logs_insert on harvest.tomato_harvest_picker_logs;
create policy tomato_harvest_picker_logs_insert
  on harvest.tomato_harvest_picker_logs
  for insert
  with check (
    core.is_company_member(company_id)
    and recorded_by = core.current_user_id()
    and exists (
      select 1
      from harvest.tomato_harvest_pickers hp
      join harvest.tomato_harvest_sessions s on s.id = hp.harvest_session_id
      join projects.projects p on p.id = s.project_id
      where hp.id = tomato_harvest_picker_logs.picker_id
        and hp.harvest_session_id = tomato_harvest_picker_logs.harvest_session_id
        and p.deleted_at is null
    )
  );

-- Logs: delete (undo — recorder or company admin)
drop policy if exists tomato_harvest_picker_logs_delete on harvest.tomato_harvest_picker_logs;
create policy tomato_harvest_picker_logs_delete
  on harvest.tomato_harvest_picker_logs
  for delete
  using (
    public.is_developer()
    or (
      core.is_company_member(company_id)
      and (
        core.is_company_admin(company_id)
        or recorded_by = core.current_user_id()
      )
    )
  );

-- -----------------------------------------------------------------------------
-- 5) Realtime (picker logs)
-- -----------------------------------------------------------------------------

do $realtime$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'harvest'
        and tablename = 'tomato_harvest_picker_logs'
    ) then
      execute 'alter publication supabase_realtime add table harvest.tomato_harvest_picker_logs';
    end if;
  end if;
end
$realtime$;

commit;
