begin;

-- =============================================================================
-- Projects, Harvest, Finance module schemas (company-scoped)
-- =============================================================================

create schema if not exists projects;
create schema if not exists finance;
create schema if not exists harvest;

--------------------------------------------------
-- TABLES
--------------------------------------------------

-- projects.projects
create table if not exists projects.projects (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  name text not null,
  crop_type text not null,
  environment text not null default 'open_field', -- open_field|greenhouse|irrigated etc
  status text not null default 'active',          -- active|completed|paused
  planting_date date not null,
  expected_harvest_date date null,
  expected_end_date date null,
  field_size numeric null,
  field_unit text null default 'acres',           -- acres|hectares
  notes text null,
  created_by text not null default core.current_user_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- projects.project_stages
create table if not exists projects.project_stages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  project_id uuid not null references projects.projects(id) on delete cascade,
  stage_key text not null,          -- e.g. nursery|transplant|flowering
  stage_name text not null,
  start_date date not null,
  end_date date null,
  is_current boolean not null default false,
  progress numeric not null default 0,   -- 0..100
  created_by text not null default core.current_user_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- projects.stage_notes
create table if not exists projects.stage_notes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  project_id uuid not null references projects.projects(id) on delete cascade,
  stage_id uuid null references projects.project_stages(id) on delete set null,
  note text not null,
  created_by text not null default core.current_user_id(),
  created_at timestamptz not null default now()
);

-- finance.expenses
create table if not exists finance.expenses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  project_id uuid null references projects.projects(id) on delete set null,
  category text not null,            -- seeds|chemicals|labor|fuel|transport|etc
  item_name text null,
  amount numeric not null check (amount >= 0),
  expense_date date not null default current_date,
  payment_method text not null default 'cash',  -- cash|mpesa|bank
  notes text null,
  created_by text not null default core.current_user_id(),
  created_at timestamptz not null default now()
);

-- harvest.harvests
create table if not exists harvest.harvests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  project_id uuid not null references projects.projects(id) on delete cascade,
  harvest_date date not null default current_date,
  unit text not null default 'kg',   -- kg|crate|bag|tray|bunch etc
  quantity numeric not null default 0,
  price_per_unit numeric null,
  buyer_name text null,
  buyer_paid boolean not null default false,
  notes text null,
  created_by text not null default core.current_user_id(),
  created_at timestamptz not null default now()
);

-- harvest.harvest_collections
create table if not exists harvest.harvest_collections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  project_id uuid not null references projects.projects(id) on delete cascade,
  collection_date date not null default current_date,
  status text not null default 'open',     -- open|closed
  unit text not null default 'kg',
  buyer_price_per_unit numeric null,
  buyer_paid boolean not null default false,
  closed_at timestamptz null,
  created_by text not null default core.current_user_id(),
  created_at timestamptz not null default now()
);

-- harvest.harvest_pickers
create table if not exists harvest.harvest_pickers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  collection_id uuid not null references harvest.harvest_collections(id) on delete cascade,
  picker_number int not null,
  picker_name text not null,
  created_at timestamptz not null default now()
);

-- unique picker per collection per company
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'harvest_pickers_company_collection_number_key'
  ) then
    alter table harvest.harvest_pickers
      add constraint harvest_pickers_company_collection_number_key
      unique (company_id, collection_id, picker_number);
  end if;
end$$;

-- harvest.picker_intake_entries
create table if not exists harvest.picker_intake_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  collection_id uuid not null references harvest.harvest_collections(id) on delete cascade,
  picker_id uuid not null references harvest.harvest_pickers(id) on delete cascade,
  quantity numeric not null,
  recorded_at timestamptz not null default now(),
  recorded_by text not null default core.current_user_id()
);

-- harvest.picker_payment_entries
create table if not exists harvest.picker_payment_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  collection_id uuid not null references harvest.harvest_collections(id) on delete cascade,
  picker_id uuid not null references harvest.harvest_pickers(id) on delete cascade,
  amount_paid numeric not null check (amount_paid >= 0),
  paid_at timestamptz not null default now(),
  paid_by text not null default core.current_user_id(),
  note text null
);

--------------------------------------------------
-- INDEXES
--------------------------------------------------

create index if not exists idx_projects_projects_company_created_at
  on projects.projects(company_id, created_at desc);

create index if not exists idx_finance_expenses_company_date
  on finance.expenses(company_id, expense_date desc);

create index if not exists idx_harvest_harvests_company_date
  on harvest.harvests(company_id, harvest_date desc);

create index if not exists idx_harvest_collections_company_date
  on harvest.harvest_collections(company_id, collection_date desc);

create index if not exists idx_harvest_intake_collection_picker_recorded_at
  on harvest.picker_intake_entries(collection_id, picker_id, recorded_at desc);

create index if not exists idx_harvest_payment_collection_picker_paid_at
  on harvest.picker_payment_entries(collection_id, picker_id, paid_at desc);

--------------------------------------------------
-- COMPATIBILITY: ensure created_by / timestamps on existing tables
--------------------------------------------------

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'projects' and table_name = 'projects'
  ) then
    alter table projects.projects
      add column if not exists expected_harvest_date date,
      add column if not exists expected_end_date date,
      add column if not exists field_size numeric,
      add column if not exists field_unit text default 'acres',
      add column if not exists notes text,
      add column if not exists created_by  text        not null default core.current_user_id(),
      add column if not exists created_at timestamptz not null default now(),
      add column if not exists updated_at timestamptz not null default now();
  end if;
end$$;

-- planning metadata jsonb on projects.projects for ProjectPlanningPage
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'projects' and table_name = 'projects'
  ) then
    alter table projects.projects
      add column if not exists planning jsonb;
  end if;
end$$;

-- ensure project_stages has all required columns (including planned/actual)
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'projects' and table_name = 'project_stages'
  ) then
    alter table projects.project_stages
      add column if not exists company_id uuid,
      add column if not exists project_id uuid,
      add column if not exists stage_key text,
      add column if not exists stage_name text,
      add column if not exists start_date date,
      add column if not exists end_date date,
      add column if not exists is_current boolean not null default false,
      add column if not exists progress numeric not null default 0,
      add column if not exists planned_start_date date,
      add column if not exists planned_end_date date,
      add column if not exists actual_start_date date,
      add column if not exists actual_end_date date,
      add column if not exists created_by  text        not null default core.current_user_id(),
      add column if not exists created_at timestamptz not null default now(),
      add column if not exists updated_at timestamptz not null default now();
  end if;
end$$;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'projects' and table_name = 'stage_notes'
  ) then
    alter table projects.stage_notes
      add column if not exists created_by  text        not null default core.current_user_id(),
      add column if not exists created_at timestamptz not null default now();
  end if;
end$$;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'finance' and table_name = 'expenses'
  ) then
    alter table finance.expenses
      add column if not exists created_by  text        not null default core.current_user_id(),
      add column if not exists created_at timestamptz not null default now();
  end if;
end$$;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'harvest' and table_name = 'harvests'
  ) then
    alter table harvest.harvests
      add column if not exists created_by  text        not null default core.current_user_id(),
      add column if not exists created_at timestamptz not null default now();
  end if;
end$$;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'harvest' and table_name = 'harvest_collections'
  ) then
    alter table harvest.harvest_collections
      add column if not exists created_by  text        not null default core.current_user_id(),
      add column if not exists created_at timestamptz not null default now();
  end if;
end$$;

--------------------------------------------------
-- UPDATED_AT TRIGGERS
--------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'set_updated_at_projects_projects'
  ) then
    create trigger set_updated_at_projects_projects
      before update on projects.projects
      for each row execute function core.set_updated_at();
  end if;
end$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'set_updated_at_projects_project_stages'
  ) then
    create trigger set_updated_at_projects_project_stages
      before update on projects.project_stages
      for each row execute function core.set_updated_at();
  end if;
end$$;

--------------------------------------------------
-- RLS POLICIES
-- Pattern:
--  select: core.is_company_member(company_id)
--  insert: core.is_company_member(company_id) and created_by = core.current_user_id() (where created_by exists)
--  update/delete: core.is_company_member(company_id) and (core.is_company_admin(company_id) or created_by = core.current_user_id())
--------------------------------------------------

alter table projects.projects enable row level security;
alter table projects.project_stages enable row level security;
alter table projects.stage_notes enable row level security;
alter table finance.expenses enable row level security;
alter table harvest.harvests enable row level security;
alter table harvest.harvest_collections enable row level security;
alter table harvest.harvest_pickers enable row level security;
alter table harvest.picker_intake_entries enable row level security;
alter table harvest.picker_payment_entries enable row level security;

-- projects.projects
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'projects'
      and tablename = 'projects'
      and policyname = 'projects_select_company_member'
  ) then
    create policy projects_select_company_member
      on projects.projects
      for select
      using (core.is_company_member(company_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'projects'
      and tablename = 'projects'
      and policyname = 'projects_insert_creator_member'
  ) then
    create policy projects_insert_creator_member
      on projects.projects
      for insert
      with check (
        core.is_company_member(company_id)
        and created_by = core.current_user_id()
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'projects'
      and tablename = 'projects'
      and policyname = 'projects_update_creator_or_admin'
  ) then
    create policy projects_update_creator_or_admin
      on projects.projects
      for update
      using (
        core.is_company_member(company_id)
        and (core.is_company_admin(company_id) or created_by = core.current_user_id())
      )
      with check (
        core.is_company_member(company_id)
        and (core.is_company_admin(company_id) or created_by = core.current_user_id())
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'projects'
      and tablename = 'projects'
      and policyname = 'projects_delete_creator_or_admin'
  ) then
    create policy projects_delete_creator_or_admin
      on projects.projects
      for delete
      using (
        core.is_company_member(company_id)
        and (core.is_company_admin(company_id) or created_by = core.current_user_id())
      );
  end if;
end$$;

-- projects.project_stages
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'projects'
      and tablename = 'project_stages'
      and policyname = 'project_stages_select_company_member'
  ) then
    create policy project_stages_select_company_member
      on projects.project_stages
      for select
      using (core.is_company_member(company_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'projects'
      and tablename = 'project_stages'
      and policyname = 'project_stages_insert_creator_member'
  ) then
    create policy project_stages_insert_creator_member
      on projects.project_stages
      for insert
      with check (
        core.is_company_member(company_id)
        and created_by = core.current_user_id()
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'projects'
      and tablename = 'project_stages'
      and policyname = 'project_stages_update_creator_or_admin'
  ) then
    create policy project_stages_update_creator_or_admin
      on projects.project_stages
      for update
      using (
        core.is_company_member(company_id)
        and (core.is_company_admin(company_id) or created_by = core.current_user_id())
      )
      with check (
        core.is_company_member(company_id)
        and (core.is_company_admin(company_id) or created_by = core.current_user_id())
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'projects'
      and tablename = 'project_stages'
      and policyname = 'project_stages_delete_creator_or_admin'
  ) then
    create policy project_stages_delete_creator_or_admin
      on projects.project_stages
      for delete
      using (
        core.is_company_member(company_id)
        and (core.is_company_admin(company_id) or created_by = core.current_user_id())
      );
  end if;
end$$;

-- projects.stage_notes
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'projects'
      and tablename = 'stage_notes'
      and policyname = 'stage_notes_select_company_member'
  ) then
    create policy stage_notes_select_company_member
      on projects.stage_notes
      for select
      using (core.is_company_member(company_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'projects'
      and tablename = 'stage_notes'
      and policyname = 'stage_notes_insert_creator_member'
  ) then
    create policy stage_notes_insert_creator_member
      on projects.stage_notes
      for insert
      with check (
        core.is_company_member(company_id)
        and created_by = core.current_user_id()
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'projects'
      and tablename = 'stage_notes'
      and policyname = 'stage_notes_update_creator_or_admin'
  ) then
    create policy stage_notes_update_creator_or_admin
      on projects.stage_notes
      for update
      using (
        core.is_company_member(company_id)
        and (core.is_company_admin(company_id) or created_by = core.current_user_id())
      )
      with check (
        core.is_company_member(company_id)
        and (core.is_company_admin(company_id) or created_by = core.current_user_id())
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'projects'
      and tablename = 'stage_notes'
      and policyname = 'stage_notes_delete_creator_or_admin'
  ) then
    create policy stage_notes_delete_creator_or_admin
      on projects.stage_notes
      for delete
      using (
        core.is_company_member(company_id)
        and (core.is_company_admin(company_id) or created_by = core.current_user_id())
      );
  end if;
end$$;

-- finance.expenses
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'finance'
      and tablename = 'expenses'
      and policyname = 'expenses_select_company_member'
  ) then
    create policy expenses_select_company_member
      on finance.expenses
      for select
      using (core.is_company_member(company_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'finance'
      and tablename = 'expenses'
      and policyname = 'expenses_insert_creator_member'
  ) then
    create policy expenses_insert_creator_member
      on finance.expenses
      for insert
      with check (
        core.is_company_member(company_id)
        and created_by = core.current_user_id()
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'finance'
      and tablename = 'expenses'
      and policyname = 'expenses_update_creator_or_admin'
  ) then
    create policy expenses_update_creator_or_admin
      on finance.expenses
      for update
      using (
        core.is_company_member(company_id)
        and (core.is_company_admin(company_id) or created_by = core.current_user_id())
      )
      with check (
        core.is_company_member(company_id)
        and (core.is_company_admin(company_id) or created_by = core.current_user_id())
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'finance'
      and tablename = 'expenses'
      and policyname = 'expenses_delete_creator_or_admin'
  ) then
    create policy expenses_delete_creator_or_admin
      on finance.expenses
      for delete
      using (
        core.is_company_member(company_id)
        and (core.is_company_admin(company_id) or created_by = core.current_user_id())
      );
  end if;
end$$;

-- harvest.harvests
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'harvest'
      and tablename = 'harvests'
      and policyname = 'harvests_select_company_member'
  ) then
    create policy harvests_select_company_member
      on harvest.harvests
      for select
      using (core.is_company_member(company_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'harvest'
      and tablename = 'harvests'
      and policyname = 'harvests_insert_creator_member'
  ) then
    create policy harvests_insert_creator_member
      on harvest.harvests
      for insert
      with check (
        core.is_company_member(company_id)
        and created_by = core.current_user_id()
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'harvest'
      and tablename = 'harvests'
      and policyname = 'harvests_update_creator_or_admin'
  ) then
    create policy harvests_update_creator_or_admin
      on harvest.harvests
      for update
      using (
        core.is_company_member(company_id)
        and (core.is_company_admin(company_id) or created_by = core.current_user_id())
      )
      with check (
        core.is_company_member(company_id)
        and (core.is_company_admin(company_id) or created_by = core.current_user_id())
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'harvest'
      and tablename = 'harvests'
      and policyname = 'harvests_delete_creator_or_admin'
  ) then
    create policy harvests_delete_creator_or_admin
      on harvest.harvests
      for delete
      using (
        core.is_company_member(company_id)
        and (core.is_company_admin(company_id) or created_by = core.current_user_id())
      );
  end if;
end$$;

-- harvest.harvest_collections
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'harvest'
      and tablename = 'harvest_collections'
      and policyname = 'harvest_collections_select_company_member'
  ) then
    create policy harvest_collections_select_company_member
      on harvest.harvest_collections
      for select
      using (core.is_company_member(company_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'harvest'
      and tablename = 'harvest_collections'
      and policyname = 'harvest_collections_insert_creator_member'
  ) then
    create policy harvest_collections_insert_creator_member
      on harvest.harvest_collections
      for insert
      with check (
        core.is_company_member(company_id)
        and created_by = core.current_user_id()
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'harvest'
      and tablename = 'harvest_collections'
      and policyname = 'harvest_collections_update_creator_or_admin'
  ) then
    create policy harvest_collections_update_creator_or_admin
      on harvest.harvest_collections
      for update
      using (
        core.is_company_member(company_id)
        and (core.is_company_admin(company_id) or created_by = core.current_user_id())
      )
      with check (
        core.is_company_member(company_id)
        and (core.is_company_admin(company_id) or created_by = core.current_user_id())
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'harvest'
      and tablename = 'harvest_collections'
      and policyname = 'harvest_collections_delete_creator_or_admin'
  ) then
    create policy harvest_collections_delete_creator_or_admin
      on harvest.harvest_collections
      for delete
      using (
        core.is_company_member(company_id)
        and (core.is_company_admin(company_id) or created_by = core.current_user_id())
      );
  end if;
end$$;

-- harvest.harvest_pickers (no created_by column)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'harvest'
      and tablename = 'harvest_pickers'
      and policyname = 'harvest_pickers_select_company_member'
  ) then
    create policy harvest_pickers_select_company_member
      on harvest.harvest_pickers
      for select
      using (core.is_company_member(company_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'harvest'
      and tablename = 'harvest_pickers'
      and policyname = 'harvest_pickers_insert_member'
  ) then
    create policy harvest_pickers_insert_member
      on harvest.harvest_pickers
      for insert
      with check (core.is_company_member(company_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'harvest'
      and tablename = 'harvest_pickers'
      and policyname = 'harvest_pickers_update_admin'
  ) then
    create policy harvest_pickers_update_admin
      on harvest.harvest_pickers
      for update
      using (
        core.is_company_member(company_id)
        and core.is_company_admin(company_id)
      )
      with check (
        core.is_company_member(company_id)
        and core.is_company_admin(company_id)
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'harvest'
      and tablename = 'harvest_pickers'
      and policyname = 'harvest_pickers_delete_admin'
  ) then
    create policy harvest_pickers_delete_admin
      on harvest.harvest_pickers
      for delete
      using (
        core.is_company_member(company_id)
        and core.is_company_admin(company_id)
      );
  end if;
end$$;

-- harvest.picker_intake_entries (no created_by column)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'harvest'
      and tablename = 'picker_intake_entries'
      and policyname = 'picker_intake_select_company_member'
  ) then
    create policy picker_intake_select_company_member
      on harvest.picker_intake_entries
      for select
      using (core.is_company_member(company_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'harvest'
      and tablename = 'picker_intake_entries'
      and policyname = 'picker_intake_insert_member'
  ) then
    create policy picker_intake_insert_member
      on harvest.picker_intake_entries
      for insert
      with check (core.is_company_member(company_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'harvest'
      and tablename = 'picker_intake_entries'
      and policyname = 'picker_intake_update_admin'
  ) then
    create policy picker_intake_update_admin
      on harvest.picker_intake_entries
      for update
      using (
        core.is_company_member(company_id)
        and core.is_company_admin(company_id)
      )
      with check (
        core.is_company_member(company_id)
        and core.is_company_admin(company_id)
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'harvest'
      and tablename = 'picker_intake_entries'
      and policyname = 'picker_intake_delete_admin'
  ) then
    create policy picker_intake_delete_admin
      on harvest.picker_intake_entries
      for delete
      using (
        core.is_company_member(company_id)
        and core.is_company_admin(company_id)
      );
  end if;
end$$;

-- harvest.picker_payment_entries (no created_by column)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'harvest'
      and tablename = 'picker_payment_entries'
      and policyname = 'picker_payment_select_company_member'
  ) then
    create policy picker_payment_select_company_member
      on harvest.picker_payment_entries
      for select
      using (core.is_company_member(company_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'harvest'
      and tablename = 'picker_payment_entries'
      and policyname = 'picker_payment_insert_member'
  ) then
    create policy picker_payment_insert_member
      on harvest.picker_payment_entries
      for insert
      with check (core.is_company_member(company_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'harvest'
      and tablename = 'picker_payment_entries'
      and policyname = 'picker_payment_update_admin'
  ) then
    create policy picker_payment_update_admin
      on harvest.picker_payment_entries
      for update
      using (
        core.is_company_member(company_id)
        and core.is_company_admin(company_id)
      )
      with check (
        core.is_company_member(company_id)
        and core.is_company_admin(company_id)
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'harvest'
      and tablename = 'picker_payment_entries'
      and policyname = 'picker_payment_delete_admin'
  ) then
    create policy picker_payment_delete_admin
      on harvest.picker_payment_entries
      for delete
      using (
        core.is_company_member(company_id)
        and core.is_company_admin(company_id)
      );
  end if;
end$$;

--------------------------------------------------
-- RPCs (SECURITY DEFINER)
--------------------------------------------------

-- projects.create_project(...)
create or replace function projects.create_project(
  p_name text,
  p_crop_type text,
  p_planting_date date,
  p_environment text default 'open_field',
  p_expected_harvest_date date default null,
  p_expected_end_date date default null,
  p_field_size numeric default null,
  p_field_unit text default 'acres',
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = core, projects, harvest, finance, public
as $$
declare
  v_company_id uuid;
  v_project_id uuid;
begin
  v_company_id := core.current_company_id();

  if v_company_id is null then
    raise exception 'No active company selected';
  end if;

  if not core.is_company_member(v_company_id) then
    raise exception 'Not authorized for company %', v_company_id;
  end if;

  insert into projects.projects (
    company_id, name, crop_type, environment, status,
    planting_date, expected_harvest_date, expected_end_date,
    field_size, field_unit, notes
  )
  values (
    v_company_id, p_name, p_crop_type, p_environment, 'active',
    p_planting_date, p_expected_harvest_date, p_expected_end_date,
    p_field_size, p_field_unit, p_notes
  )
  returning id into v_project_id;

  -- Seed simple default stages: Planting, Growth, Harvest
  insert into projects.project_stages (
    company_id, project_id, stage_key, stage_name,
    start_date, end_date, is_current, progress
  )
  values
    (v_company_id, v_project_id, 'planting', 'Planting',
     p_planting_date, p_planting_date, true, 0),
    (v_company_id, v_project_id, 'growth', 'Growth',
     p_planting_date, p_expected_harvest_date, false, 0),
    (v_company_id, v_project_id, 'harvest', 'Harvest',
     p_expected_harvest_date, p_expected_end_date, false, 0);

  return v_project_id;
end;
$$;

--------------------------------------------------
-- GRANTS FOR AUTHENTICATED ROLE (TABLE-LEVEL)
--------------------------------------------------

grant select, insert, update, delete on all tables in schema projects to authenticated;
grant select, insert, update, delete on all tables in schema harvest  to authenticated;
grant select, insert, update, delete on all tables in schema finance  to authenticated;

-- public wrapper for Supabase RPC: create_project(...)
create or replace function public.create_project(
  p_name text,
  p_crop_type text,
  p_planting_date date,
  p_environment text default 'open_field',
  p_expected_harvest_date date default null,
  p_expected_end_date date default null,
  p_field_size numeric default null,
  p_field_unit text default 'acres',
  p_notes text default null
)
returns uuid
language sql
security definer
set search_path = core, projects, harvest, finance, public
as $$
  select projects.create_project(
    p_name,
    p_crop_type,
    p_planting_date,
    p_environment,
    p_expected_harvest_date,
    p_expected_end_date,
    p_field_size,
    p_field_unit,
    p_notes
  );
$$;

-- harvest.create_collection(project_id, date)
create or replace function harvest.create_collection(
  p_project_id uuid,
  p_date date default current_date
)
returns uuid
language plpgsql
security definer
set search_path = core, projects, harvest, finance, public
as $$
declare
  v_company_id uuid;
  v_project_company uuid;
  v_collection_id uuid;
begin
  v_company_id := core.current_company_id();
  if v_company_id is null then
    raise exception 'No active company selected';
  end if;

  if not core.is_company_member(v_company_id) then
    raise exception 'Not authorized for company %', v_company_id;
  end if;

  select company_id
  into v_project_company
  from projects.projects
  where id = p_project_id;

  if v_project_company is null then
    raise exception 'Project % not found', p_project_id;
  end if;

  if v_project_company <> v_company_id then
    raise exception 'Project does not belong to current company';
  end if;

  insert into harvest.harvest_collections (
    company_id, project_id, collection_date, status
  )
  values (
    v_company_id, p_project_id, p_date, 'open'
  )
  returning id into v_collection_id;

  return v_collection_id;
end;
$$;

-- harvest.record_intake(collection_id, picker_number, quantity)
create or replace function harvest.record_intake(
  p_collection_id uuid,
  p_picker_number int,
  p_quantity numeric
)
returns void
language plpgsql
security definer
set search_path = core, projects, harvest, finance, public
as $$
declare
  v_company_id uuid;
  v_status text;
  v_collection_company uuid;
  v_picker_id uuid;
begin
  if p_quantity < 0 then
    raise exception 'Quantity cannot be negative';
  end if;

  v_company_id := core.current_company_id();
  if v_company_id is null then
    raise exception 'No active company selected';
  end if;

  if not core.is_company_member(v_company_id) then
    raise exception 'Not authorized for company %', v_company_id;
  end if;

  select company_id, status
  into v_collection_company, v_status
  from harvest.harvest_collections
  where id = p_collection_id;

  if v_collection_company is null then
    raise exception 'Collection % not found', p_collection_id;
  end if;

  if v_collection_company <> v_company_id then
    raise exception 'Collection does not belong to current company';
  end if;

  if v_status <> 'open' then
    raise exception 'Collection % is not open', p_collection_id;
  end if;

  -- Find or create picker
  select id
  into v_picker_id
  from harvest.harvest_pickers
  where company_id = v_company_id
    and collection_id = p_collection_id
    and picker_number = p_picker_number;

  if v_picker_id is null then
    insert into harvest.harvest_pickers (
      company_id, collection_id, picker_number, picker_name
    )
    values (
      v_company_id, p_collection_id, p_picker_number,
      'Picker ' || p_picker_number::text
    )
    returning id into v_picker_id;
  end if;

  insert into harvest.picker_intake_entries (
    company_id, collection_id, picker_id, quantity
  )
  values (
    v_company_id, p_collection_id, v_picker_id, p_quantity
  );
end;
$$;

-- harvest.record_payment(collection_id, picker_number, amount_paid, note)
create or replace function harvest.record_payment(
  p_collection_id uuid,
  p_picker_number int,
  p_amount_paid numeric,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = core, projects, harvest, finance, public
as $$
declare
  v_company_id uuid;
  v_status text;
  v_collection_company uuid;
  v_picker_id uuid;
begin
  if p_amount_paid < 0 then
    raise exception 'Payment amount cannot be negative';
  end if;

  v_company_id := core.current_company_id();
  if v_company_id is null then
    raise exception 'No active company selected';
  end if;

  if not core.is_company_member(v_company_id) then
    raise exception 'Not authorized for company %', v_company_id;
  end if;

  select company_id, status
  into v_collection_company, v_status
  from harvest.harvest_collections
  where id = p_collection_id;

  if v_collection_company is null then
    raise exception 'Collection % not found', p_collection_id;
  end if;

  if v_collection_company <> v_company_id then
    raise exception 'Collection does not belong to current company';
  end if;

  if v_status <> 'open' then
    raise exception 'Collection % is not open', p_collection_id;
  end if;

  -- Ensure picker exists (same logic as record_intake)
  select id
  into v_picker_id
  from harvest.harvest_pickers
  where company_id = v_company_id
    and collection_id = p_collection_id
    and picker_number = p_picker_number;

  if v_picker_id is null then
    insert into harvest.harvest_pickers (
      company_id, collection_id, picker_number, picker_name
    )
    values (
      v_company_id, p_collection_id, p_picker_number,
      'Picker ' || p_picker_number::text
    )
    returning id into v_picker_id;
  end if;

  insert into harvest.picker_payment_entries (
    company_id, collection_id, picker_id,
    amount_paid, note
  )
  values (
    v_company_id, p_collection_id, v_picker_id,
    p_amount_paid, p_note
  );
end;
$$;

-- finance.add_expense(project_id, category, amount, date, method, notes)
create or replace function finance.add_expense(
  p_project_id uuid,
  p_category text,
  p_amount numeric,
  p_date date default current_date,
  p_method text default 'cash',
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = core, projects, harvest, finance, public
as $$
declare
  v_company_id uuid;
  v_project_company uuid;
  v_expense_id uuid;
begin
  if p_amount < 0 then
    raise exception 'Expense amount cannot be negative';
  end if;

  v_company_id := core.current_company_id();
  if v_company_id is null then
    raise exception 'No active company selected';
  end if;

  if not core.is_company_member(v_company_id) then
    raise exception 'Not authorized for company %', v_company_id;
  end if;

  if p_project_id is not null then
    select company_id
    into v_project_company
    from projects.projects
    where id = p_project_id;

    if v_project_company is null then
      raise exception 'Project % not found', p_project_id;
    end if;

    if v_project_company <> v_company_id then
      raise exception 'Project does not belong to current company';
    end if;
  end if;

  insert into finance.expenses (
    company_id, project_id, category, amount,
    expense_date, payment_method, notes
  )
  values (
    v_company_id, p_project_id, p_category, p_amount,
    p_date, p_method, p_notes
  )
  returning id into v_expense_id;

  return v_expense_id;
end;
$$;

commit;

