-- Sprint 2: harvest.harvests soft delete + row_version + audit triggers; company read on record_audit_log;
-- developer-only data_integrity_findings + fv_run_data_integrity_checks.

begin;

-- -----------------------------------------------------------------------------
-- 1) harvest.harvests — columns + partial index
-- -----------------------------------------------------------------------------
alter table harvest.harvests
  add column if not exists deleted_at timestamptz,
  add column if not exists row_version int not null default 1;

create index if not exists idx_harvest_harvests_company_date_active
  on harvest.harvests (company_id, harvest_date desc)
  where deleted_at is null;

-- -----------------------------------------------------------------------------
-- 2) Triggers — row_version + record_audit_log (same helpers as Phase 2)
-- -----------------------------------------------------------------------------
drop trigger if exists tr_fv_bump_row_version_harvest_harvests on harvest.harvests;
create trigger tr_fv_bump_row_version_harvest_harvests
  before update on harvest.harvests
  for each row
  execute function public.fv_bump_row_version();

drop trigger if exists tr_fv_record_audit_harvest_harvests on harvest.harvests;
create trigger tr_fv_record_audit_harvest_harvests
  after insert or update or delete on harvest.harvests
  for each row
  execute function public.fv_record_audit_row();

-- -----------------------------------------------------------------------------
-- 3) RLS — harvests: hide soft-deleted for members; no hard DELETE
-- -----------------------------------------------------------------------------
drop policy if exists harvests_select_company_member on harvest.harvests;
create policy harvests_select_company_member
  on harvest.harvests
  for select
  using (
    public.is_developer()
    or (
      core.is_company_member(company_id)
      and deleted_at is null
      and exists (
        select 1
        from projects.projects p
        where p.id = harvests.project_id
          and p.deleted_at is null
      )
    )
  );

drop policy if exists harvests_insert_creator_member on harvest.harvests;
create policy harvests_insert_creator_member
  on harvest.harvests
  for insert
  with check (
    core.is_company_member(company_id)
    and created_by = core.current_user_id()
    and exists (
      select 1
      from projects.projects p
      where p.id = harvests.project_id
        and p.deleted_at is null
    )
  );

drop policy if exists harvests_update_creator_or_admin on harvest.harvests;
create policy harvests_update_creator_or_admin
  on harvest.harvests
  for update
  using (
    public.is_developer()
    or (
      core.is_company_member(company_id)
      and (core.is_company_admin(company_id) or created_by = core.current_user_id())
      and deleted_at is null
      and exists (
        select 1
        from projects.projects p
        where p.id = harvests.project_id
          and p.deleted_at is null
      )
    )
  )
  with check (
    public.is_developer()
    or (
      core.is_company_member(company_id)
      and (core.is_company_admin(company_id) or created_by = core.current_user_id())
      and exists (
        select 1
        from projects.projects p
        where p.id = harvests.project_id
          and p.deleted_at is null
      )
    )
  );

drop policy if exists harvests_delete_creator_or_admin on harvest.harvests;

-- -----------------------------------------------------------------------------
-- 4) record_audit_log — company members can read their tenant rows
-- -----------------------------------------------------------------------------
grant select on public.record_audit_log to authenticated;

drop policy if exists record_audit_log_select_company_member on public.record_audit_log;
create policy record_audit_log_select_company_member
  on public.record_audit_log
  for select
  to authenticated
  using (
    company_id is not null
    and core.is_company_member(company_id)
  );

-- -----------------------------------------------------------------------------
-- 5) Orphan / drift findings (developer + service_role only)
-- -----------------------------------------------------------------------------
create table if not exists public.data_integrity_findings (
  id uuid primary key default gen_random_uuid(),
  run_at timestamptz not null default now(),
  company_id uuid,
  severity text not null check (severity in ('warning', 'error')),
  code text not null,
  detail jsonb
);

create index if not exists idx_data_integrity_findings_company_run
  on public.data_integrity_findings (company_id, run_at desc);

alter table public.data_integrity_findings enable row level security;

drop policy if exists data_integrity_findings_select_developer on public.data_integrity_findings;
create policy data_integrity_findings_select_developer
  on public.data_integrity_findings
  for select
  to authenticated
  using (public.is_developer());

grant select on public.data_integrity_findings to authenticated;

create or replace function public.fv_run_data_integrity_checks(p_company_id uuid default null)
returns bigint
language plpgsql
security definer
set search_path = public, projects, harvest, finance, core
as $$
declare
  v_total bigint := 0;
  v_ins bigint := 0;
begin
  if auth.role() is distinct from 'service_role' and not coalesce(public.is_developer(), false) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  insert into public.data_integrity_findings (company_id, severity, code, detail)
  select
    e.company_id,
    'warning',
    'expense_on_deleted_project',
    jsonb_build_object('expense_id', e.id, 'project_id', e.project_id)
  from finance.expenses e
  join projects.projects p on p.id = e.project_id
  where e.deleted_at is null
    and p.deleted_at is not null
    and (p_company_id is null or e.company_id = p_company_id);
  get diagnostics v_ins = row_count;
  v_total := v_total + v_ins;

  insert into public.data_integrity_findings (company_id, severity, code, detail)
  select
    h.company_id,
    'warning',
    'harvest_on_deleted_project',
    jsonb_build_object('harvest_id', h.id, 'project_id', h.project_id)
  from harvest.harvests h
  join projects.projects p on p.id = h.project_id
  where h.deleted_at is null
    and p.deleted_at is not null
    and (p_company_id is null or h.company_id = p_company_id);
  get diagnostics v_ins = row_count;
  v_total := v_total + v_ins;

  insert into public.data_integrity_findings (company_id, severity, code, detail)
  select
    hc.company_id,
    'warning',
    'harvest_collection_on_deleted_project',
    jsonb_build_object('collection_id', hc.id, 'project_id', hc.project_id)
  from harvest.harvest_collections hc
  join projects.projects p on p.id = hc.project_id
  where hc.deleted_at is null
    and p.deleted_at is not null
    and (p_company_id is null or hc.company_id = p_company_id);
  get diagnostics v_ins = row_count;
  v_total := v_total + v_ins;

  return v_total;
end;
$$;

grant execute on function public.fv_run_data_integrity_checks(uuid) to authenticated;
grant execute on function public.fv_run_data_integrity_checks(uuid) to service_role;

commit;

notify pgrst, 'reload schema';
