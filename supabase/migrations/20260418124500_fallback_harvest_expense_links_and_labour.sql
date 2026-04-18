-- Fallback harvest engine: expense linking + auto-generated picker labour expense (immutable).

begin;

-- -----------------------------------------------------------------------------
-- 1) finance.expense_links (queryable linkage to domain records)
-- -----------------------------------------------------------------------------
create table if not exists finance.expense_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  project_id uuid null references projects.projects(id) on delete set null,
  expense_id uuid not null references finance.expenses(id) on delete cascade,
  ref_type text not null,
  ref_id uuid not null,
  created_by text not null default core.current_user_id(),
  created_at timestamptz not null default now(),
  unique (expense_id, ref_type, ref_id)
);

create index if not exists idx_finance_expense_links_company_ref
  on finance.expense_links (company_id, ref_type, ref_id, created_at desc);

grant select, insert, update, delete on finance.expense_links to authenticated, service_role;

alter table finance.expense_links enable row level security;

drop policy if exists expense_links_select_company_member on finance.expense_links;
create policy expense_links_select_company_member
  on finance.expense_links
  for select
  using (
    public.is_developer()
    or (
      core.is_company_member(company_id)
      and (
        project_id is null
        or exists (
          select 1
          from projects.projects p
          where p.id = project_id
            and p.deleted_at is null
        )
      )
    )
  );

drop policy if exists expense_links_insert_company_member on finance.expense_links;
create policy expense_links_insert_company_member
  on finance.expense_links
  for insert
  with check (
    public.is_developer()
    or (
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
    )
  );

drop policy if exists expense_links_update_creator_or_admin on finance.expense_links;
create policy expense_links_update_creator_or_admin
  on finance.expense_links
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

drop policy if exists expense_links_delete_creator_or_admin on finance.expense_links;
create policy expense_links_delete_creator_or_admin
  on finance.expense_links
  for delete
  using (
    public.is_developer()
    or (
      core.is_company_member(company_id)
      and (core.is_company_admin(company_id) or created_by = core.current_user_id())
    )
  );

-- -----------------------------------------------------------------------------
-- 2) Harden finance.expenses against forging system rows
-- -----------------------------------------------------------------------------
-- Block inserts that try to impersonate system-maintained sources (auto rows are inserted by SECURITY DEFINER functions).
drop policy if exists expenses_insert_creator_member on finance.expenses;
create policy expenses_insert_creator_member
  on finance.expenses
  for insert
  with check (
    public.is_developer()
    or (
      core.is_company_member(company_id)
      and created_by = core.current_user_id()
      and coalesce(auto_generated, false) = false
      and lower(coalesce(source, 'manual')) not in ('harvest_pickers', 'fallback_pickers')
      and (
        project_id is null
        or exists (
          select 1
          from projects.projects p
          where p.id = project_id
            and p.deleted_at is null
        )
      )
    )
  );

-- Update policy already blocks auto_generated=true; keep as-is (defined by tomato labour migration).

-- -----------------------------------------------------------------------------
-- 3) Fallback sessions: picker rate + labour sync
-- -----------------------------------------------------------------------------
alter table harvest.fallback_harvest_sessions
  add column if not exists picker_rate_per_unit numeric not null default 0 check (picker_rate_per_unit >= 0);

comment on column harvest.fallback_harvest_sessions.picker_rate_per_unit is
  'Optional picker labour rate per harvested unit when use_pickers=true (system uses this for auto-generated labour expense).';

create unique index if not exists uniq_finance_expenses_fallback_picker_labour
  on finance.expenses (source, reference_id)
  where lower(coalesce(source, '')) = 'fallback_pickers' and reference_id is not null;

create or replace function harvest.sync_fallback_picker_labour_expense(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = harvest, finance, projects, core, public
as $$
declare
  s harvest.fallback_harvest_sessions%rowtype;
  v_units numeric;
  v_cost numeric(14, 2);
  v_farm_id uuid;
  v_expense_id uuid;
  v_note text;
begin
  if p_session_id is null then
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_session_id::text, 95));

  select * into s
  from harvest.fallback_harvest_sessions
  where id = p_session_id;

  if not found then
    update finance.expenses
    set
      deleted_at = coalesce(deleted_at, now()),
      amount = 0
    where lower(coalesce(source, '')) = 'fallback_pickers'
      and reference_id = p_session_id
      and deleted_at is null;
    return;
  end if;

  if not (
    pg_has_role(current_user, 'service_role', 'usage')
    or public.is_developer()
    or core.is_company_member(s.company_id)
  ) then
    raise exception 'Not authorized to sync fallback picker labour for this session';
  end if;

  if coalesce(s.use_pickers, false) = false then
    update finance.expenses
    set
      deleted_at = coalesce(deleted_at, now()),
      amount = 0
    where lower(coalesce(source, '')) = 'fallback_pickers'
      and reference_id = p_session_id
      and deleted_at is null;
    return;
  end if;

  select coalesce(sum(l.units), 0)::numeric into v_units
  from harvest.fallback_session_picker_logs l
  where l.harvest_session_id = p_session_id;

  v_cost := round(coalesce(s.picker_rate_per_unit, 0) * coalesce(v_units, 0), 2);

  select p.farm_id into v_farm_id
  from projects.projects p
  where p.id = s.project_id
  limit 1;

  v_note := 'Labour (Harvest pickers)\n\nThis expense is calculated from picker activity.';

  select e.id into v_expense_id
  from finance.expenses e
  where lower(coalesce(e.source, '')) = 'fallback_pickers'
    and e.reference_id = p_session_id
  limit 1;

  if v_cost <= 0 or v_farm_id is null then
    if v_expense_id is not null then
      update finance.expenses
      set
        amount = 0,
        deleted_at = now(),
        note = v_note
      where id = v_expense_id;
    end if;
    return;
  end if;

  if v_expense_id is null then
    insert into finance.expenses (
      company_id,
      farm_id,
      project_id,
      crop_id,
      category,
      amount,
      expense_date,
      payment_method,
      note,
      created_by,
      source,
      reference_id,
      auto_generated,
      currency
    ) values (
      s.company_id,
      v_farm_id,
      s.project_id,
      s.crop_id,
      'labour',
      v_cost,
      s.session_date,
      'cash',
      v_note,
      coalesce(nullif(trim(s.created_by), ''), 'system'),
      'FALLBACK_PICKERS',
      p_session_id,
      true,
      'KES'
    );
  else
    update finance.expenses
    set
      amount = v_cost,
      expense_date = s.session_date,
      project_id = s.project_id,
      farm_id = v_farm_id,
      crop_id = s.crop_id,
      note = v_note,
      category = 'labour',
      deleted_at = null,
      auto_generated = true,
      source = 'FALLBACK_PICKERS',
      reference_id = p_session_id
    where id = v_expense_id;
  end if;
end;
$$;

revoke all on function harvest.sync_fallback_picker_labour_expense(uuid) from public;
grant execute on function harvest.sync_fallback_picker_labour_expense(uuid) to authenticated, service_role;

create or replace function harvest.tr_fallback_picker_logs_sync_labour_expense()
returns trigger
language plpgsql
security invoker
set search_path = harvest, public
as $$
declare
  sid uuid;
begin
  sid := coalesce(new.harvest_session_id, old.harvest_session_id);
  perform harvest.sync_fallback_picker_labour_expense(sid);
  perform harvest.refresh_fallback_session_totals(sid);
  return coalesce(new, old);
end;
$$;

drop trigger if exists tr_fallback_picker_logs_sync_labour_expense on harvest.fallback_session_picker_logs;
create trigger tr_fallback_picker_logs_sync_labour_expense
  after insert or update or delete on harvest.fallback_session_picker_logs
  for each row
  execute function harvest.tr_fallback_picker_logs_sync_labour_expense();

create or replace function harvest.tr_fallback_sessions_sync_labour_expense()
returns trigger
language plpgsql
security invoker
set search_path = harvest, public
as $$
begin
  if tg_op = 'DELETE' then
    perform harvest.sync_fallback_picker_labour_expense(old.id);
    return old;
  elsif tg_op = 'INSERT' then
    perform harvest.sync_fallback_picker_labour_expense(new.id);
    perform harvest.refresh_fallback_session_totals(new.id);
    return new;
  elsif tg_op = 'UPDATE' then
    if new.use_pickers is distinct from old.use_pickers
      or new.picker_rate_per_unit is distinct from old.picker_rate_per_unit
      or new.session_date is distinct from old.session_date
      or new.project_id is distinct from old.project_id
      or new.crop_id is distinct from old.crop_id
      or new.company_id is distinct from old.company_id
    then
      perform harvest.sync_fallback_picker_labour_expense(new.id);
      perform harvest.refresh_fallback_session_totals(new.id);
    end if;
    return new;
  end if;
  return new;
end;
$$;

drop trigger if exists tr_fallback_sessions_sync_labour_expense on harvest.fallback_harvest_sessions;
create trigger tr_fallback_sessions_sync_labour_expense
  after insert or update or delete on harvest.fallback_harvest_sessions
  for each row
  execute function harvest.tr_fallback_sessions_sync_labour_expense();

-- -----------------------------------------------------------------------------
-- 4) Totals: include linked finance expenses (via finance.expense_links)
-- -----------------------------------------------------------------------------
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

  -- Expenses: sum all linked finance.expenses for this session + fallback picker labour expense (which is also linked by reference_id).
  select coalesce(sum(e.amount), 0)::numeric into v_exp
  from finance.expense_links l
  join finance.expenses e on e.id = l.expense_id
  where l.ref_type = 'fallback_harvest_session'
    and l.ref_id = p_session_id
    and e.deleted_at is null;

  -- Include auto picker labour even if not linked (reference_id = session id).
  v_exp := v_exp + coalesce((
    select sum(e.amount)::numeric
    from finance.expenses e
    where lower(coalesce(e.source, '')) = 'fallback_pickers'
      and e.reference_id = p_session_id
      and e.deleted_at is null
  ), 0);

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
-- 5) Trigger: expense_links change refreshes session totals
-- -----------------------------------------------------------------------------
create or replace function harvest.tr_expense_links_refresh_fallback_totals()
returns trigger
language plpgsql
security invoker
set search_path = harvest, finance, public
as $$
declare
  rid uuid;
begin
  rid := coalesce(new.ref_id, old.ref_id);
  if coalesce(new.ref_type, old.ref_type) = 'fallback_harvest_session' then
    perform harvest.refresh_fallback_session_totals(rid);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists tr_expense_links_refresh_fallback_totals on finance.expense_links;
create trigger tr_expense_links_refresh_fallback_totals
  after insert or update or delete on finance.expense_links
  for each row
  execute function harvest.tr_expense_links_refresh_fallback_totals();

-- -----------------------------------------------------------------------------
-- 6) Realtime: expense_links (best-effort); expenses already added by tomato labour migration
-- -----------------------------------------------------------------------------
do $realtime$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'finance'
        and tablename = 'expense_links'
    ) then
      execute 'alter publication supabase_realtime add table finance.expense_links';
    end if;
  end if;
end
$realtime$;

commit;

