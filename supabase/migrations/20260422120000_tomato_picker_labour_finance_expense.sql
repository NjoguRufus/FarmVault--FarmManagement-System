-- Tomato harvest picker labour → one finance.expenses row per session (auto sync).
-- Triggers: picker logs insert/update/delete; session rate/status/date/project changes; session delete.

begin;

-- -----------------------------------------------------------------------------
-- 1) Columns on finance.expenses
-- -----------------------------------------------------------------------------
alter table finance.expenses
  add column if not exists auto_generated boolean not null default false;

alter table finance.expenses
  add column if not exists crop_id uuid null;

comment on column finance.expenses.auto_generated is 'True when amount is maintained by the system (e.g. tomato picker labour).';
comment on column finance.expenses.crop_id is 'Optional crop linkage (e.g. tomato harvest session crop_id).';

alter table finance.expenses
  add column if not exists currency text default 'KES';

-- One auto labour expense per tomato harvest session (reference_id = session id).
create unique index if not exists uniq_finance_expenses_tomato_picker_labour
  on finance.expenses (source, reference_id)
  where source = 'HARVEST_PICKERS' and reference_id is not null;

-- -----------------------------------------------------------------------------
-- 2) Core sync (security definer — bypasses RLS for upsert)
-- -----------------------------------------------------------------------------
create or replace function harvest.sync_tomato_picker_labour_expense(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = harvest, finance, projects, core, public
as $$
declare
  s harvest.tomato_harvest_sessions%rowtype;
  v_buckets bigint;
  v_cost numeric(14, 2);
  v_farm_id uuid;
  v_expense_id uuid;
  v_note text;
  v_title text;
begin
  if p_session_id is null then
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_session_id::text, 42));

  select * into s
  from harvest.tomato_harvest_sessions
  where id = p_session_id;

  if not found then
    update finance.expenses
    set
      deleted_at = coalesce(deleted_at, now()),
      amount = 0
    where source = 'HARVEST_PICKERS'
      and reference_id = p_session_id
      and deleted_at is null;
    return;
  end if;

  if not (
    pg_has_role(current_user, 'service_role', 'usage')
    or public.is_developer()
    or core.is_company_member(s.company_id)
  ) then
    raise exception 'Not authorized to sync tomato picker labour for this session';
  end if;

  select coalesce(sum(l.units), 0)::bigint into v_buckets
  from harvest.tomato_harvest_picker_logs l
  where l.harvest_session_id = p_session_id;

  v_cost := round(coalesce(s.picker_rate_per_bucket, 0) * v_buckets::numeric, 2);

  select p.farm_id into v_farm_id
  from projects.projects p
  where p.id = s.project_id
  limit 1;

  v_title := format('Labour (Tomato Harvest #%s)', s.harvest_number);
  v_note := v_title || E'\n\nThis expense is calculated from picker activity.';

  select e.id into v_expense_id
  from finance.expenses e
  where e.source = 'HARVEST_PICKERS'
    and e.reference_id = p_session_id
  limit 1;

  if v_cost <= 0 then
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

  if v_farm_id is null then
    raise notice 'harvest.sync_tomato_picker_labour_expense: missing farm_id for project %', s.project_id;
    return;
  end if;

  if v_expense_id is null then
    insert into finance.expenses (
      company_id,
      farm_id,
      project_id,
      category,
      amount,
      expense_date,
      payment_method,
      note,
      created_by,
      source,
      reference_id,
      auto_generated,
      crop_id,
      currency
    ) values (
      s.company_id,
      v_farm_id,
      s.project_id,
      'labour',
      v_cost,
      s.session_date,
      'cash',
      v_note,
      coalesce(nullif(trim(s.created_by), ''), 'system'),
      'HARVEST_PICKERS',
      p_session_id,
      true,
      s.crop_id,
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
      source = 'HARVEST_PICKERS',
      reference_id = p_session_id
    where id = v_expense_id;
  end if;
end;
$$;

comment on function harvest.sync_tomato_picker_labour_expense(uuid) is
  'Upserts finance.expenses labour row for tomato harvest picker buckets (source HARVEST_PICKERS, reference_id = session).';

revoke all on function harvest.sync_tomato_picker_labour_expense(uuid) from public;
-- Triggers invoke this as the session user; SECURITY DEFINER still requires EXECUTE.
grant execute on function harvest.sync_tomato_picker_labour_expense(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3) Triggers
-- -----------------------------------------------------------------------------
create or replace function harvest.tr_tomato_picker_logs_sync_labour_expense()
returns trigger
language plpgsql
security invoker
set search_path = harvest, public
as $$
declare
  sid uuid;
begin
  sid := coalesce(new.harvest_session_id, old.harvest_session_id);
  perform harvest.sync_tomato_picker_labour_expense(sid);
  return coalesce(new, old);
end;
$$;

drop trigger if exists tr_tomato_picker_logs_sync_labour_expense on harvest.tomato_harvest_picker_logs;
create trigger tr_tomato_picker_logs_sync_labour_expense
  after insert or update or delete on harvest.tomato_harvest_picker_logs
  for each row
  execute function harvest.tr_tomato_picker_logs_sync_labour_expense();

create or replace function harvest.tr_tomato_sessions_sync_labour_expense()
returns trigger
language plpgsql
security invoker
set search_path = harvest, public
as $$
begin
  if tg_op = 'DELETE' then
    perform harvest.sync_tomato_picker_labour_expense(old.id);
    return old;
  elsif tg_op = 'INSERT' then
    perform harvest.sync_tomato_picker_labour_expense(new.id);
    return new;
  elsif tg_op = 'UPDATE' then
    if new.picker_rate_per_bucket is distinct from old.picker_rate_per_bucket
      or new.status is distinct from old.status
      or new.session_date is distinct from old.session_date
      or new.project_id is distinct from old.project_id
      or new.harvest_number is distinct from old.harvest_number
      or new.crop_id is distinct from old.crop_id
      or new.company_id is distinct from old.company_id
    then
      perform harvest.sync_tomato_picker_labour_expense(new.id);
    end if;
    return new;
  end if;
  return new;
end;
$$;

drop trigger if exists tr_tomato_sessions_sync_labour_expense on harvest.tomato_harvest_sessions;
create trigger tr_tomato_sessions_sync_labour_expense
  after insert or update or delete on harvest.tomato_harvest_sessions
  for each row
  execute function harvest.tr_tomato_sessions_sync_labour_expense();

-- -----------------------------------------------------------------------------
-- 4) RLS — block manual edits / forged inserts for auto tomato picker rows
-- -----------------------------------------------------------------------------
drop policy if exists expenses_insert_creator_member on finance.expenses;
create policy expenses_insert_creator_member
  on finance.expenses
  for insert
  with check (
    public.is_developer()
    or (
      core.is_company_member(company_id)
      and created_by = core.current_user_id()
      and coalesce(source, 'manual') is distinct from 'HARVEST_PICKERS'
      and coalesce(auto_generated, false) = false
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

drop policy if exists expenses_update_creator_or_admin on finance.expenses;
create policy expenses_update_creator_or_admin
  on finance.expenses
  for update
  using (
    public.is_developer()
    or (
      core.is_company_member(company_id)
      and coalesce(auto_generated, false) = false
      and (core.is_company_admin(company_id) or created_by = core.current_user_id())
      and deleted_at is null
    )
  )
  with check (
    public.is_developer()
    or (
      core.is_company_member(company_id)
      and coalesce(auto_generated, false) = false
      and (core.is_company_admin(company_id) or created_by = core.current_user_id())
    )
  );

-- -----------------------------------------------------------------------------
-- 5) Backfill existing tomato sessions
-- -----------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in select id from harvest.tomato_harvest_sessions
  loop
    perform harvest.sync_tomato_picker_labour_expense(r.id);
  end loop;
end$$;

-- -----------------------------------------------------------------------------
-- 6) Realtime (dashboard already subscribes to finance.expenses)
-- -----------------------------------------------------------------------------
do $realtime$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'finance'
        and tablename = 'expenses'
    ) then
      execute 'alter publication supabase_realtime add table finance.expenses';
    end if;
  end if;
end
$realtime$;

commit;
