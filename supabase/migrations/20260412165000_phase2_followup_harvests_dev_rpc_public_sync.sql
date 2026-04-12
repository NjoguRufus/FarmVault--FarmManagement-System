-- Phase 2 follow-up: harvest writes tied to active projects, developer project read from canonical schema,
-- optional public.projects mirror columns + sync from projects.projects, rate-limit insert count active only.

begin;

-- -----------------------------------------------------------------------------
-- 1) harvest.harvests — INSERT/UPDATE only when parent project is not soft-deleted
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 2) developer_get_project_by_id — read canonical projects.projects (not legacy public.projects)
-- -----------------------------------------------------------------------------
create or replace function public.developer_get_project_by_id(p_project_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, admin, projects
as $$
declare
  v_out jsonb;
begin
  if not admin.is_developer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_project_id is null then
    return null;
  end if;

  select to_jsonb(p)
  into v_out
  from projects.projects p
  where p.id = p_project_id
  limit 1;

  return v_out;
end;
$$;

grant execute on function public.developer_get_project_by_id(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 3) public.projects — align columns + sync soft fields from canonical (plain table only)
-- -----------------------------------------------------------------------------
do $$
declare
  v_rk "char";
begin
  select c.relkind into v_rk
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'projects';

  if v_rk = 'r' then
    alter table public.projects add column if not exists deleted_at timestamptz;
    alter table public.projects add column if not exists row_version int not null default 1;
  end if;
end$$;

create or replace function public.fv_sync_public_projects_soft_fields()
returns trigger
language plpgsql
security definer
set search_path = public, projects
as $$
declare
  v_rk "char";
begin
  select c.relkind into v_rk
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'projects';

  if v_rk is distinct from 'r'::"char" then
    return new;
  end if;

  update public.projects pub
  set
    deleted_at = new.deleted_at,
    row_version = new.row_version
  where pub.id = new.id;

  return new;
end;
$$;

drop trigger if exists tr_fv_sync_public_projects_soft_fields on projects.projects;
create trigger tr_fv_sync_public_projects_soft_fields
  after update of deleted_at, row_version on projects.projects
  for each row
  execute function public.fv_sync_public_projects_soft_fields();

-- -----------------------------------------------------------------------------
-- 4) Rate-limit INSERT on public.projects — count only active (non–soft-deleted) rows
-- -----------------------------------------------------------------------------
do $$
declare
  v_rk "char";
begin
  select c.relkind into v_rk
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'projects';

  if v_rk = 'r' then
    execute 'drop policy if exists "projects_rate_and_feature_limit" on public.projects';
    execute $pol$
      create policy "projects_rate_and_feature_limit" on public.projects
        as restrictive for insert to authenticated
        with check (
          public.check_rate_limit(public.current_clerk_id(),
            'projects_create', public.get_rate_limit_for_action('projects_create'), 60)
          and (
            public.get_user_plan() = 'pro'
            or (
              select count(*) from public.projects e
              where e.company_id::text = public.current_company_id()::text
                and e.deleted_at is null
            ) < 2
          )
        )
    $pol$;
  end if;
end$$;

commit;

notify pgrst, 'reload schema';
