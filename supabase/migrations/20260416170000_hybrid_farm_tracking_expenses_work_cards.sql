begin;

-- Hybrid farm/project tracking:
-- - farm_id always required
-- - project_id optional
-- Applies to finance.expenses and ops.work_cards.

do $$
begin
  if to_regclass('projects.farms') is null then
    raise exception 'projects.farms table not found. Apply farms migration first.';
  end if;
end
$$;

-- Ensure each company with legacy records has at least one farm.
do $$
begin
  if to_regclass('finance.expenses') is not null then
    insert into projects.farms (company_id, name, location, ownership_type)
    select distinct e.company_id, 'Legacy Farm', 'Unspecified', 'owned'
    from finance.expenses e
    where e.company_id is not null
      and exists (
        select 1
        from core.companies c
        where c.id = e.company_id
      )
      and not exists (
        select 1
        from projects.farms f
        where f.company_id = e.company_id
      )
    on conflict do nothing;
  end if;

  if to_regclass('ops.work_cards') is not null then
    insert into projects.farms (company_id, name, location, ownership_type)
    select distinct w.company_id, 'Legacy Farm', 'Unspecified', 'owned'
    from ops.work_cards w
    where w.company_id is not null
      and exists (
        select 1
        from core.companies c
        where c.id = w.company_id
      )
      and not exists (
        select 1
        from projects.farms f
        where f.company_id = w.company_id
      )
    on conflict do nothing;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- finance.expenses
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('finance.expenses') is not null then
    alter table finance.expenses
      add column if not exists farm_id uuid null references projects.farms(id) on delete restrict;

    create index if not exists idx_finance_expenses_farm_project_date
      on finance.expenses (farm_id, project_id, expense_date desc);

    -- Backfill from project -> farm linkage when project exists.
    update finance.expenses e
    set farm_id = p.farm_id
    from projects.projects p
    where e.project_id = p.id
      and e.farm_id is null;

    -- Remaining rows: map by company to earliest farm.
    update finance.expenses e
    set farm_id = (
      select f.id
      from projects.farms f
      where f.company_id = e.company_id
      order by f.created_at asc
      limit 1
    )
    where e.farm_id is null;

    if exists (select 1 from finance.expenses where farm_id is null) then
      raise exception 'finance.expenses backfill incomplete: farm_id still null';
    end if;

    alter table finance.expenses
      alter column farm_id set not null;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- ops.work_cards
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('ops.work_cards') is not null then
    alter table ops.work_cards
      add column if not exists farm_id uuid null references projects.farms(id) on delete restrict;

    create index if not exists idx_ops_work_cards_farm_project_created
      on ops.work_cards (farm_id, project_id, created_at desc);

    -- Backfill from project -> farm linkage when project exists.
    update ops.work_cards w
    set farm_id = p.farm_id
    from projects.projects p
    where w.project_id = p.id
      and w.farm_id is null;

    -- Remaining rows: map by company to earliest farm.
    update ops.work_cards w
    set farm_id = (
      select f.id
      from projects.farms f
      where f.company_id = w.company_id
      order by f.created_at asc
      limit 1
    )
    where w.farm_id is null;

    -- Remove orphan legacy rows that cannot be mapped safely:
    -- (no company, or company no longer exists). These rows are outside tenant scope.
    delete from ops.work_cards w
    where w.farm_id is null
      and (
        w.company_id is null
        or not exists (
          select 1
          from core.companies c
          where c.id = w.company_id
        )
      );

    if exists (select 1 from ops.work_cards where farm_id is null) then
      raise exception 'ops.work_cards backfill incomplete: farm_id still null';
    end if;

    alter table ops.work_cards
      alter column farm_id set not null;
  end if;
end
$$;

commit;
