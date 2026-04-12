-- Phase 2: data integrity — soft deletes, row_version bumps, record-level audit trail,
-- RLS tightened for deleted rows and child tables, SECURITY DEFINER harvest RPC guards.

begin;

-- -----------------------------------------------------------------------------
-- 1) Columns: deleted_at + row_version (canonical module tables)
-- -----------------------------------------------------------------------------
alter table projects.projects
  add column if not exists deleted_at timestamptz,
  add column if not exists row_version int not null default 1;

alter table finance.expenses
  add column if not exists deleted_at timestamptz,
  add column if not exists row_version int not null default 1;

alter table harvest.harvest_collections
  add column if not exists deleted_at timestamptz,
  add column if not exists row_version int not null default 1;

create index if not exists idx_projects_projects_company_active_created
  on projects.projects (company_id, created_at desc)
  where deleted_at is null;

create index if not exists idx_finance_expenses_company_date_active
  on finance.expenses (company_id, expense_date desc)
  where deleted_at is null;

create index if not exists idx_harvest_collections_company_date_active
  on harvest.harvest_collections (company_id, collection_date desc)
  where deleted_at is null;

-- -----------------------------------------------------------------------------
-- 2) row_version bump (every UPDATE)
-- -----------------------------------------------------------------------------
create or replace function public.fv_bump_row_version()
returns trigger
language plpgsql
as $$
begin
  new.row_version := coalesce(old.row_version, 0) + 1;
  return new;
end;
$$;

drop trigger if exists tr_fv_bump_row_version_projects_projects on projects.projects;
create trigger tr_fv_bump_row_version_projects_projects
  before update on projects.projects
  for each row
  execute function public.fv_bump_row_version();

drop trigger if exists tr_fv_bump_row_version_finance_expenses on finance.expenses;
create trigger tr_fv_bump_row_version_finance_expenses
  before update on finance.expenses
  for each row
  execute function public.fv_bump_row_version();

drop trigger if exists tr_fv_bump_row_version_harvest_collections on harvest.harvest_collections;
create trigger tr_fv_bump_row_version_harvest_collections
  before update on harvest.harvest_collections
  for each row
  execute function public.fv_bump_row_version();

-- -----------------------------------------------------------------------------
-- 3) Append-only audit log (separate from legacy public.audit_logs)
-- -----------------------------------------------------------------------------
create table if not exists public.record_audit_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  schema_name text not null,
  table_name text not null,
  record_id text not null,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_data jsonb,
  new_data jsonb,
  actor_user_id text,
  company_id uuid
);

create index if not exists idx_record_audit_log_company_created
  on public.record_audit_log (company_id, created_at desc);

create index if not exists idx_record_audit_log_table_record
  on public.record_audit_log (schema_name, table_name, record_id);

alter table public.record_audit_log enable row level security;

drop policy if exists record_audit_log_select_developer on public.record_audit_log;
create policy record_audit_log_select_developer
  on public.record_audit_log
  for select
  to authenticated
  using (public.is_developer());

create or replace function public.fv_record_audit_row()
returns trigger
language plpgsql
security definer
set search_path = public, core
as $$
declare
  v_actor text := nullif(trim(coalesce(core.current_user_id(), '')), '');
  v_company uuid;
  v_rid text;
begin
  if tg_op = 'DELETE' then
    v_company := old.company_id;
    v_rid := old.id::text;
    insert into public.record_audit_log (
      schema_name, table_name, record_id, action, old_data, new_data, actor_user_id, company_id
    ) values (
      tg_table_schema, tg_table_name, v_rid, 'DELETE', to_jsonb(old), null, v_actor, v_company
    );
    return old;
  elsif tg_op = 'UPDATE' then
    v_company := new.company_id;
    v_rid := new.id::text;
    insert into public.record_audit_log (
      schema_name, table_name, record_id, action, old_data, new_data, actor_user_id, company_id
    ) values (
      tg_table_schema, tg_table_name, v_rid, 'UPDATE', to_jsonb(old), to_jsonb(new), v_actor, v_company
    );
    return new;
  elsif tg_op = 'INSERT' then
    v_company := new.company_id;
    v_rid := new.id::text;
    insert into public.record_audit_log (
      schema_name, table_name, record_id, action, old_data, new_data, actor_user_id, company_id
    ) values (
      tg_table_schema, tg_table_name, v_rid, 'INSERT', null, to_jsonb(new), v_actor, v_company
    );
    return new;
  end if;
  return null;
end;
$$;

drop trigger if exists tr_fv_record_audit_projects_projects on projects.projects;
create trigger tr_fv_record_audit_projects_projects
  after insert or update or delete on projects.projects
  for each row
  execute function public.fv_record_audit_row();

drop trigger if exists tr_fv_record_audit_finance_expenses on finance.expenses;
create trigger tr_fv_record_audit_finance_expenses
  after insert or update or delete on finance.expenses
  for each row
  execute function public.fv_record_audit_row();

drop trigger if exists tr_fv_record_audit_harvest_collections on harvest.harvest_collections;
create trigger tr_fv_record_audit_harvest_collections
  after insert or update or delete on harvest.harvest_collections
  for each row
  execute function public.fv_record_audit_row();

-- -----------------------------------------------------------------------------
-- 4) RLS — projects.projects (soft delete; remove hard DELETE)
-- -----------------------------------------------------------------------------
drop policy if exists projects_select_company_member on projects.projects;
create policy projects_select_company_member
  on projects.projects
  for select
  using (
    public.is_developer()
    or (
      core.is_company_member(company_id)
      and deleted_at is null
    )
  );

drop policy if exists projects_insert_creator_member on projects.projects;
create policy projects_insert_creator_member
  on projects.projects
  for insert
  with check (
    core.is_company_member(company_id)
    and created_by = core.current_user_id()
  );

drop policy if exists projects_update_creator_or_admin on projects.projects;
drop policy if exists projects_update_active on projects.projects;
drop policy if exists projects_soft_delete on projects.projects;

-- USING sees the existing row: members may update only non-deleted rows (soft-delete is an update).
create policy projects_update_creator_or_admin
  on projects.projects
  for update
  using (
    public.is_developer()
    or (
      core.is_company_member(company_id)
      and (core.is_company_admin(company_id) or created_by = core.current_user_id())
      and deleted_at is null
    )
  )
  with check (
    public.is_developer()
    or (
      core.is_company_member(company_id)
      and (core.is_company_admin(company_id) or created_by = core.current_user_id())
    )
  );

drop policy if exists projects_delete_creator_or_admin on projects.projects;

-- -----------------------------------------------------------------------------
-- 5) RLS — child project tables (hide when parent project soft-deleted)
-- -----------------------------------------------------------------------------
drop policy if exists project_stages_select_company_member on projects.project_stages;
create policy project_stages_select_company_member
  on projects.project_stages
  for select
  using (
    public.is_developer()
    or (
      core.is_company_member(company_id)
      and exists (
        select 1
        from projects.projects p
        where p.id = project_stages.project_id
          and p.deleted_at is null
      )
    )
  );

drop policy if exists project_stages_insert_creator_member on projects.project_stages;
create policy project_stages_insert_creator_member
  on projects.project_stages
  for insert
  with check (
    core.is_company_member(company_id)
    and created_by = core.current_user_id()
    and exists (
      select 1
      from projects.projects p
      where p.id = project_stages.project_id
        and p.deleted_at is null
    )
  );

drop policy if exists project_stages_update_creator_or_admin on projects.project_stages;
create policy project_stages_update_creator_or_admin
  on projects.project_stages
  for update
  using (
    core.is_company_member(company_id)
    and (core.is_company_admin(company_id) or created_by = core.current_user_id())
    and exists (
      select 1
      from projects.projects p
      where p.id = project_stages.project_id
        and p.deleted_at is null
    )
  )
  with check (
    core.is_company_member(company_id)
    and (core.is_company_admin(company_id) or created_by = core.current_user_id())
    and exists (
      select 1
      from projects.projects p
      where p.id = project_stages.project_id
        and p.deleted_at is null
    )
  );

drop policy if exists stage_notes_select_company_member on projects.stage_notes;
create policy stage_notes_select_company_member
  on projects.stage_notes
  for select
  using (
    public.is_developer()
    or (
      core.is_company_member(company_id)
      and exists (
        select 1
        from projects.projects p
        where p.id = stage_notes.project_id
          and p.deleted_at is null
      )
    )
  );

drop policy if exists stage_notes_insert_creator_member on projects.stage_notes;
create policy stage_notes_insert_creator_member
  on projects.stage_notes
  for insert
  with check (
    core.is_company_member(company_id)
    and created_by = core.current_user_id()
    and exists (
      select 1
      from projects.projects p
      where p.id = stage_notes.project_id
        and p.deleted_at is null
    )
  );

drop policy if exists stage_notes_update_creator_or_admin on projects.stage_notes;
create policy stage_notes_update_creator_or_admin
  on projects.stage_notes
  for update
  using (
    core.is_company_member(company_id)
    and (core.is_company_admin(company_id) or created_by = core.current_user_id())
    and exists (
      select 1
      from projects.projects p
      where p.id = stage_notes.project_id
        and p.deleted_at is null
    )
  )
  with check (
    core.is_company_member(company_id)
    and (core.is_company_admin(company_id) or created_by = core.current_user_id())
    and exists (
      select 1
      from projects.projects p
      where p.id = stage_notes.project_id
        and p.deleted_at is null
    )
  );

-- -----------------------------------------------------------------------------
-- 6) RLS — finance.expenses
-- -----------------------------------------------------------------------------
drop policy if exists expenses_select_company_member on finance.expenses;
create policy expenses_select_company_member
  on finance.expenses
  for select
  using (
    public.is_developer()
    or (
      core.is_company_member(company_id)
      and deleted_at is null
      and (
        project_id is null
        or exists (
          select 1
          from projects.projects p
          where p.id = expenses.project_id
            and p.deleted_at is null
        )
      )
    )
  );

drop policy if exists expenses_insert_creator_member on finance.expenses;
create policy expenses_insert_creator_member
  on finance.expenses
  for insert
  with check (
    core.is_company_member(company_id)
    and created_by = core.current_user_id()
    and (
      project_id is null
      or exists (
        select 1
        from projects.projects p
        where p.id = project_id
          and p.deleted_at is null
      )
    )
  );

drop policy if exists expenses_update_creator_or_admin on finance.expenses;
drop policy if exists expenses_update_active on finance.expenses;
drop policy if exists expenses_soft_delete on finance.expenses;

create policy expenses_update_creator_or_admin
  on finance.expenses
  for update
  using (
    public.is_developer()
    or (
      core.is_company_member(company_id)
      and (core.is_company_admin(company_id) or created_by = core.current_user_id())
      and deleted_at is null
    )
  )
  with check (
    public.is_developer()
    or (
      core.is_company_member(company_id)
      and (core.is_company_admin(company_id) or created_by = core.current_user_id())
    )
  );

drop policy if exists expenses_delete_creator_or_admin on finance.expenses;

-- -----------------------------------------------------------------------------
-- 7) RLS — harvest.harvests (hide when project soft-deleted)
-- -----------------------------------------------------------------------------
drop policy if exists harvests_select_company_member on harvest.harvests;
create policy harvests_select_company_member
  on harvest.harvests
  for select
  using (
    public.is_developer()
    or (
      core.is_company_member(company_id)
      and exists (
        select 1
        from projects.projects p
        where p.id = harvests.project_id
          and p.deleted_at is null
      )
    )
  );

-- -----------------------------------------------------------------------------
-- 8) RLS — harvest.harvest_collections + harvest children
-- -----------------------------------------------------------------------------
drop policy if exists harvest_collections_select_company_member on harvest.harvest_collections;
create policy harvest_collections_select_company_member
  on harvest.harvest_collections
  for select
  using (
    public.is_developer()
    or (
      core.is_company_member(company_id)
      and deleted_at is null
      and exists (
        select 1
        from projects.projects p
        where p.id = harvest_collections.project_id
          and p.deleted_at is null
      )
    )
  );

drop policy if exists harvest_collections_insert_creator_member on harvest.harvest_collections;
create policy harvest_collections_insert_creator_member
  on harvest.harvest_collections
  for insert
  with check (
    core.is_company_member(company_id)
    and created_by = core.current_user_id()
    and exists (
      select 1
      from projects.projects p
      where p.id = harvest_collections.project_id
        and p.deleted_at is null
    )
  );

drop policy if exists harvest_collections_update_creator_or_admin on harvest.harvest_collections;
drop policy if exists harvest_collections_update_active on harvest.harvest_collections;
drop policy if exists harvest_collections_soft_delete on harvest.harvest_collections;

create policy harvest_collections_update_creator_or_admin
  on harvest.harvest_collections
  for update
  using (
    public.is_developer()
    or (
      core.is_company_member(company_id)
      and (core.is_company_admin(company_id) or created_by = core.current_user_id())
      and deleted_at is null
    )
  )
  with check (
    public.is_developer()
    or (
      core.is_company_member(company_id)
      and (core.is_company_admin(company_id) or created_by = core.current_user_id())
    )
  );

drop policy if exists harvest_collections_delete_creator_or_admin on harvest.harvest_collections;

-- Active collection + active project (for child rows)
drop policy if exists harvest_pickers_select_company_member on harvest.harvest_pickers;
create policy harvest_pickers_select_company_member
  on harvest.harvest_pickers
  for select
  using (
    public.is_developer()
    or (
      core.is_company_member(company_id)
      and exists (
        select 1
        from harvest.harvest_collections c
        join projects.projects p on p.id = c.project_id
        where c.id = harvest_pickers.collection_id
          and c.deleted_at is null
          and p.deleted_at is null
      )
    )
  );

drop policy if exists harvest_pickers_insert_member on harvest.harvest_pickers;
create policy harvest_pickers_insert_member
  on harvest.harvest_pickers
  for insert
  with check (
    core.is_company_member(company_id)
    and exists (
      select 1
      from harvest.harvest_collections c
      join projects.projects p on p.id = c.project_id
      where c.id = harvest_pickers.collection_id
        and c.deleted_at is null
        and p.deleted_at is null
    )
  );

drop policy if exists harvest_pickers_update_admin on harvest.harvest_pickers;
create policy harvest_pickers_update_admin
  on harvest.harvest_pickers
  for update
  using (
    core.is_company_member(company_id)
    and core.is_company_admin(company_id)
    and exists (
      select 1
      from harvest.harvest_collections c
      join projects.projects p on p.id = c.project_id
      where c.id = harvest_pickers.collection_id
        and c.deleted_at is null
        and p.deleted_at is null
    )
  )
  with check (
    core.is_company_member(company_id)
    and core.is_company_admin(company_id)
    and exists (
      select 1
      from harvest.harvest_collections c
      join projects.projects p on p.id = c.project_id
      where c.id = harvest_pickers.collection_id
        and c.deleted_at is null
        and p.deleted_at is null
    )
  );

drop policy if exists harvest_pickers_delete_admin on harvest.harvest_pickers;
create policy harvest_pickers_delete_admin
  on harvest.harvest_pickers
  for delete
  using (
    core.is_company_member(company_id)
    and core.is_company_admin(company_id)
    and exists (
      select 1
      from harvest.harvest_collections c
      join projects.projects p on p.id = c.project_id
      where c.id = harvest_pickers.collection_id
        and c.deleted_at is null
        and p.deleted_at is null
    )
  );

drop policy if exists picker_intake_select_company_member on harvest.picker_intake_entries;
create policy picker_intake_select_company_member
  on harvest.picker_intake_entries
  for select
  using (
    public.is_developer()
    or (
      core.is_company_member(company_id)
      and exists (
        select 1
        from harvest.harvest_collections c
        join projects.projects p on p.id = c.project_id
        where c.id = picker_intake_entries.collection_id
          and c.deleted_at is null
          and p.deleted_at is null
      )
    )
  );

drop policy if exists picker_intake_insert_member on harvest.picker_intake_entries;
create policy picker_intake_insert_member
  on harvest.picker_intake_entries
  for insert
  with check (
    core.is_company_member(company_id)
    and exists (
      select 1
      from harvest.harvest_collections c
      join projects.projects p on p.id = c.project_id
      where c.id = picker_intake_entries.collection_id
        and c.deleted_at is null
        and p.deleted_at is null
    )
  );

drop policy if exists picker_intake_update_admin on harvest.picker_intake_entries;
drop policy if exists picker_intake_update_member on harvest.picker_intake_entries;
create policy picker_intake_update_member
  on harvest.picker_intake_entries
  for update
  using (
    core.is_company_member(company_id)
    and exists (
      select 1
      from harvest.harvest_collections c
      join projects.projects p on p.id = c.project_id
      where c.id = picker_intake_entries.collection_id
        and c.deleted_at is null
        and p.deleted_at is null
    )
  )
  with check (
    core.is_company_member(company_id)
    and exists (
      select 1
      from harvest.harvest_collections c
      join projects.projects p on p.id = c.project_id
      where c.id = picker_intake_entries.collection_id
        and c.deleted_at is null
        and p.deleted_at is null
    )
  );

drop policy if exists picker_intake_delete_admin on harvest.picker_intake_entries;
drop policy if exists picker_intake_delete_member on harvest.picker_intake_entries;
create policy picker_intake_delete_member
  on harvest.picker_intake_entries
  for delete
  using (
    core.is_company_member(company_id)
    and exists (
      select 1
      from harvest.harvest_collections c
      join projects.projects p on p.id = c.project_id
      where c.id = picker_intake_entries.collection_id
        and c.deleted_at is null
        and p.deleted_at is null
    )
  );

drop policy if exists picker_payment_select_company_member on harvest.picker_payment_entries;
create policy picker_payment_select_company_member
  on harvest.picker_payment_entries
  for select
  using (
    public.is_developer()
    or (
      core.is_company_member(company_id)
      and exists (
        select 1
        from harvest.harvest_collections c
        join projects.projects p on p.id = c.project_id
        where c.id = picker_payment_entries.collection_id
          and c.deleted_at is null
          and p.deleted_at is null
      )
    )
  );

drop policy if exists picker_payment_insert_member on harvest.picker_payment_entries;
create policy picker_payment_insert_member
  on harvest.picker_payment_entries
  for insert
  with check (
    core.is_company_member(company_id)
    and exists (
      select 1
      from harvest.harvest_collections c
      join projects.projects p on p.id = c.project_id
      where c.id = picker_payment_entries.collection_id
        and c.deleted_at is null
        and p.deleted_at is null
    )
  );

drop policy if exists picker_payment_update_admin on harvest.picker_payment_entries;
create policy picker_payment_update_admin
  on harvest.picker_payment_entries
  for update
  using (
    core.is_company_member(company_id)
    and core.is_company_admin(company_id)
    and exists (
      select 1
      from harvest.harvest_collections c
      join projects.projects p on p.id = c.project_id
      where c.id = picker_payment_entries.collection_id
        and c.deleted_at is null
        and p.deleted_at is null
    )
  )
  with check (
    core.is_company_member(company_id)
    and core.is_company_admin(company_id)
    and exists (
      select 1
      from harvest.harvest_collections c
      join projects.projects p on p.id = c.project_id
      where c.id = picker_payment_entries.collection_id
        and c.deleted_at is null
        and p.deleted_at is null
    )
  );

drop policy if exists picker_payment_delete_admin on harvest.picker_payment_entries;
create policy picker_payment_delete_admin
  on harvest.picker_payment_entries
  for delete
  using (
    core.is_company_member(company_id)
    and core.is_company_admin(company_id)
    and exists (
      select 1
      from harvest.harvest_collections c
      join projects.projects p on p.id = c.project_id
      where c.id = picker_payment_entries.collection_id
        and c.deleted_at is null
        and p.deleted_at is null
    )
  );

-- -----------------------------------------------------------------------------
-- 9) SECURITY DEFINER RPCs — block writes when collection or project is soft-deleted
-- -----------------------------------------------------------------------------
create or replace function harvest.record_intake(
  p_collection_id uuid,
  p_picker_id uuid,
  p_quantity numeric,
  p_unit text default 'kg'
)
returns void
language plpgsql
security definer
set search_path = core, projects, harvest, public
as $$
declare
  v_company_id uuid;
  v_status text;
  v_collection_company uuid;
  v_picker_company uuid;
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

  select c.company_id, c.status
  into v_collection_company, v_status
  from harvest.harvest_collections c
  join projects.projects p on p.id = c.project_id
  where c.id = p_collection_id
    and c.deleted_at is null
    and p.deleted_at is null;

  if v_collection_company is null then
    raise exception 'Collection % not found', p_collection_id;
  end if;

  if v_collection_company <> v_company_id then
    raise exception 'Collection does not belong to current company';
  end if;

  if v_status <> 'open' and v_status is not null then
    raise exception 'Collection % is not open', p_collection_id;
  end if;

  select company_id into v_picker_company
  from harvest.harvest_pickers
  where id = p_picker_id and collection_id = p_collection_id;

  if v_picker_company is null or v_picker_company <> v_company_id then
    raise exception 'Picker % not found or not in this collection', p_picker_id;
  end if;

  insert into harvest.picker_intake_entries (company_id, collection_id, picker_id, quantity, unit, recorded_by)
  values (v_company_id, p_collection_id, p_picker_id, p_quantity, coalesce(nullif(trim(p_unit), ''), 'kg'), core.current_user_id());
end;
$$;

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

  select c.company_id, c.status
  into v_collection_company, v_status
  from harvest.harvest_collections c
  join projects.projects p on p.id = c.project_id
  where c.id = p_collection_id
    and c.deleted_at is null
    and p.deleted_at is null;

  if v_collection_company is null then
    raise exception 'Collection % not found', p_collection_id;
  end if;

  if v_collection_company <> v_company_id then
    raise exception 'Collection does not belong to current company';
  end if;

  if v_status <> 'open' then
    raise exception 'Collection % is not open', p_collection_id;
  end if;

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

create or replace function harvest.record_payment(
  p_collection_id uuid,
  p_picker_id uuid,
  p_amount_paid numeric,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = core, projects, harvest, public
as $$
declare
  v_company_id uuid;
  v_status text;
  v_collection_company uuid;
  v_picker_company uuid;
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

  select c.company_id, c.status
  into v_collection_company, v_status
  from harvest.harvest_collections c
  join projects.projects p on p.id = c.project_id
  where c.id = p_collection_id
    and c.deleted_at is null
    and p.deleted_at is null;

  if v_collection_company is null then
    raise exception 'Collection % not found', p_collection_id;
  end if;

  if v_collection_company <> v_company_id then
    raise exception 'Collection does not belong to current company';
  end if;

  if v_status <> 'open' and v_status is not null then
    raise exception 'Collection % is not open', p_collection_id;
  end if;

  select company_id into v_picker_company
  from harvest.harvest_pickers
  where id = p_picker_id and collection_id = p_collection_id;

  if v_picker_company is null or v_picker_company <> v_company_id then
    raise exception 'Picker % not found or not in this collection', p_picker_id;
  end if;

  insert into harvest.picker_payment_entries (company_id, collection_id, picker_id, amount_paid, note, paid_by)
  values (v_company_id, p_collection_id, p_picker_id, p_amount_paid, p_note, core.current_user_id());
end;
$$;

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

  select c.company_id, c.status
  into v_collection_company, v_status
  from harvest.harvest_collections c
  join projects.projects p on p.id = c.project_id
  where c.id = p_collection_id
    and c.deleted_at is null
    and p.deleted_at is null;

  if v_collection_company is null then
    raise exception 'Collection % not found', p_collection_id;
  end if;

  if v_collection_company <> v_company_id then
    raise exception 'Collection does not belong to current company';
  end if;

  if v_status <> 'open' then
    raise exception 'Collection % is not open', p_collection_id;
  end if;

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

create or replace function harvest.close_collection(p_collection_id uuid)
returns void
language plpgsql
security definer
set search_path = core, projects, harvest, public
as $$
declare
  v_company_id uuid;
begin
  v_company_id := core.current_company_id();
  if v_company_id is null then
    raise exception 'No active company selected';
  end if;

  if not core.is_company_member(v_company_id) then
    raise exception 'Not authorized for company %', v_company_id;
  end if;

  if not (core.is_company_admin(v_company_id) or exists (
    select 1 from harvest.harvest_collections c
    where c.id = p_collection_id and c.company_id = v_company_id and c.created_by = core.current_user_id()
  )) then
    raise exception 'Only admin or collection creator can close collection';
  end if;

  update harvest.harvest_collections c
  set status = 'closed', closed_at = now()
  from projects.projects p
  where c.id = p_collection_id
    and c.company_id = v_company_id
    and c.project_id = p.id
    and c.deleted_at is null
    and p.deleted_at is null;

  if not found then
    raise exception 'Collection % not found', p_collection_id;
  end if;
end;
$$;

create or replace function harvest.create_collection(
  p_project_id uuid,
  p_company_id uuid default null,
  p_custom_name text default null,
  p_collection_date date default current_date,
  p_picker_price_per_unit numeric default 20,
  p_crop_type text default 'french_beans'
)
returns harvest.harvest_collections
language plpgsql
security definer
set search_path = public, harvest, projects, core
as $$
declare
  v_company_id uuid;
  v_project_exists uuid;
  v_max_seq integer;
  v_count_rows integer;
  v_next integer;
  v_auto_name text;
  v_final_name text;
  v_mod100 integer;
  v_mod10 integer;
  v_suffix text;
  v_row harvest.harvest_collections%rowtype;
  v_attempt int := 0;
begin
  v_company_id := coalesce(p_company_id, core.current_company_id());
  if v_company_id is null then
    raise exception 'No active company selected';
  end if;

  if not core.is_company_member(v_company_id) then
    raise exception 'Not authorized for company %', v_company_id;
  end if;

  select p.id
    into v_project_exists
  from projects.projects p
  where p.id = p_project_id
    and p.company_id = v_company_id
    and p.deleted_at is null
  for update;

  if v_project_exists is null then
    raise exception 'Project not found or not in current company';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_company_id::text || ':' || p_project_id::text));

  loop
    v_attempt := v_attempt + 1;

    select
      coalesce(max(hc.sequence_number), 0),
      count(*)
      into v_max_seq, v_count_rows
    from harvest.harvest_collections hc
    where hc.project_id = p_project_id
      and hc.company_id = v_company_id
      and hc.deleted_at is null;

    v_next := greatest(v_max_seq, v_count_rows) + 1;

    v_mod100 := v_next % 100;
    v_mod10 := v_next % 10;
    if v_mod100 between 11 and 13 then
      v_suffix := 'th';
    elsif v_mod10 = 1 then
      v_suffix := 'st';
    elsif v_mod10 = 2 then
      v_suffix := 'nd';
    elsif v_mod10 = 3 then
      v_suffix := 'rd';
    else
      v_suffix := 'th';
    end if;

    v_auto_name := format('test %s%s Harvest', v_next, v_suffix);
    v_final_name := coalesce(nullif(trim(p_custom_name), ''), v_auto_name);

    begin
      insert into harvest.harvest_collections (
        company_id,
        project_id,
        crop_type,
        collection_date,
        unit,
        buyer_price_per_unit,
        is_closed,
        price_per_kg,
        picker_price_per_unit,
        notes,
        sequence_number,
        status
      )
      values (
        v_company_id,
        p_project_id,
        coalesce(nullif(trim(p_crop_type), ''), 'french_beans'),
        coalesce(p_collection_date, current_date),
        'kg',
        null,
        false,
        null,
        coalesce(p_picker_price_per_unit, 20),
        v_final_name,
        v_next,
        'open'
      )
      returning * into v_row;

      return v_row;
    exception
      when unique_violation then
        if v_attempt < 3 then
          continue;
        end if;
        raise;
    end;
  end loop;
end;
$$;

commit;

notify pgrst, 'reload schema';
