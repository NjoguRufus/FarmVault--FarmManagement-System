begin;

create schema if not exists admin;

create table if not exists admin.developer_delete_audit (
  id uuid primary key default gen_random_uuid(),
  action text,
  entity_type text,
  entity_id text,
  target_id text,
  target_name text,
  actor_clerk_user_id text,
  performed_by text,
  metadata jsonb,
  created_at timestamptz default now()
);

alter table admin.developer_delete_audit
  add column if not exists action text,
  add column if not exists entity_type text,
  add column if not exists entity_id text,
  add column if not exists target_id text,
  add column if not exists target_name text,
  add column if not exists actor_clerk_user_id text,
  add column if not exists performed_by text,
  add column if not exists metadata jsonb,
  add column if not exists created_at timestamptz default now();

create index if not exists idx_dev_delete_audit_created_at on admin.developer_delete_audit(created_at desc);
create index if not exists idx_dev_delete_audit_action on admin.developer_delete_audit(action);
create index if not exists idx_dev_delete_audit_entity on admin.developer_delete_audit(entity_type, entity_id);

drop function if exists public.delete_company_safely(uuid);
drop function if exists public.delete_company_safely(text);

create or replace function developer.delete_company_safely(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = admin, core, public, developer, projects, finance, harvest
as $$
declare
  v_actor text := core.current_user_id();
  v_company_name text;
  v_company_uuid uuid;
  v_deleted_counts jsonb := '{}'::jsonb;
  v_count int := 0;
  v_user_reset_count int := 0;
begin
  v_company_uuid := p_company_id;
  if v_company_uuid is null then
    return jsonb_build_object('success', false, 'blocked', true, 'reason', 'Company id is required');
  end if;

  -- Enforce developer-only access when guard exists.
  if to_regprocedure('developer.assert_developer()') is not null then
    perform developer.assert_developer();
  elsif to_regprocedure('public.assert_developer()') is not null then
    perform public.assert_developer();
  end if;

  if v_company_uuid::text in ('fa61d13d-3466-48db-a39c-4a474ccfed58') then
    return jsonb_build_object('success', false, 'blocked', true, 'reason', 'This company is protected and cannot be deleted');
  end if;

  select coalesce(c.name, pc.name, pc.company_name)
  into v_company_name
  from core.companies c
  full join public.companies pc on pc.id::text = c.id::text
  where c.id = v_company_uuid or pc.id::text = v_company_uuid::text
  limit 1;

  -- Mark affected users for reset to prevent passive session resurrection.
  if to_regclass('admin.reset_users') is not null then
    insert into admin.reset_users (clerk_user_id, email, deleted_by, allow_resignup, is_active, deleted_at, note)
    select distinct p.clerk_user_id, p.email, v_actor, true, true, now(), 'Company deleted by developer'
    from core.company_members cm
    left join core.profiles p on p.clerk_user_id = cm.clerk_user_id
    where cm.company_id = v_company_uuid
      and cm.clerk_user_id is not null;
    get diagnostics v_user_reset_count = row_count;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('reset_users_inserted', v_user_reset_count);
  end if;

  -- Dependency-safe delete order: access -> member/employee -> subscription -> company.
  if to_regclass('public.employee_project_access') is not null then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public' and table_name = 'employee_project_access' and column_name = 'company_id'
    ) then
      delete from public.employee_project_access where company_id::text = v_company_uuid::text;
      get diagnostics v_count = row_count;
      v_deleted_counts := v_deleted_counts || jsonb_build_object('employee_project_access', v_count);
    elsif exists (
      select 1
      from information_schema.columns
      where table_schema = 'public' and table_name = 'employee_project_access' and column_name = 'employee_id'
    ) and to_regclass('public.employees') is not null then
      delete from public.employee_project_access epa
      using public.employees e
      where epa.employee_id = e.id
        and e.company_id::text = v_company_uuid::text;
      get diagnostics v_count = row_count;
      v_deleted_counts := v_deleted_counts || jsonb_build_object('employee_project_access', v_count);
    end if;
  end if;

  if to_regclass('public.employee_invites') is not null then
    delete from public.employee_invites where company_id::text = v_company_uuid::text;
    get diagnostics v_count = row_count;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('employee_invites', v_count);
  end if;
  if to_regclass('public.pending_invites') is not null then
    delete from public.pending_invites where company_id::text = v_company_uuid::text;
    get diagnostics v_count = row_count;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('pending_invites', v_count);
  end if;
  if to_regclass('public.invitations') is not null then
    delete from public.invitations where company_id::text = v_company_uuid::text;
    get diagnostics v_count = row_count;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('invitations', v_count);
  end if;

  if to_regclass('public.alert_recipients') is not null then
    delete from public.alert_recipients where company_id::text = v_company_uuid::text;
    get diagnostics v_count = row_count;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('alert_recipients', v_count);
  end if;

  if to_regclass('public.employees') is not null then
    delete from public.employees where company_id::text = v_company_uuid::text;
    get diagnostics v_count = row_count;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('employees', v_count);
  end if;
  if to_regclass('public.company_members') is not null then
    delete from public.company_members where company_id::text = v_company_uuid::text;
    get diagnostics v_count = row_count;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('public_company_members', v_count);
  end if;
  if to_regclass('core.company_members') is not null then
    delete from core.company_members where company_id = v_company_uuid;
    get diagnostics v_count = row_count;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('core_company_members', v_count);
  end if;

  if to_regclass('core.profiles') is not null then
    update core.profiles
    set active_company_id = null
    where active_company_id = v_company_uuid;
    get diagnostics v_count = row_count;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('profiles_active_company_cleared', v_count);
  end if;

  if to_regclass('public.company_subscriptions') is not null then
    delete from public.company_subscriptions where company_id::text = v_company_uuid::text;
    get diagnostics v_count = row_count;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('company_subscriptions', v_count);
  end if;

  if to_regclass('public.companies') is not null then
    delete from public.companies where id::text = v_company_uuid::text;
    get diagnostics v_count = row_count;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('public_companies', v_count);
  end if;
  if to_regclass('core.companies') is not null then
    delete from core.companies where id = v_company_uuid;
    get diagnostics v_count = row_count;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('core_companies', v_count);
  end if;

  begin
    insert into admin.developer_delete_audit (
      action,
      entity_type,
      entity_id,
      target_id,
      target_name,
      actor_clerk_user_id,
      performed_by,
      metadata
    )
    values (
      'delete',
      'company',
      v_company_uuid::text,
      v_company_uuid::text,
      coalesce(v_company_name, 'Unknown Company'),
      v_actor,
      v_actor,
      jsonb_build_object(
        'source', 'developer_console',
        'deleted_counts', v_deleted_counts
      )
    );
  exception when others then
    -- Never fail a company delete because audit schema drifted.
    raise notice 'Audit logging skipped: %', sqlerrm;
  end;

  raise log '[DevDelete] Company delete cleanup counts: company_id=%, counts=%', v_company_uuid::text, v_deleted_counts::text;

  return jsonb_build_object(
    'success', true,
    'deleted_company_id', v_company_uuid::text,
    'blocked', false,
    'reason', null,
    'deleted_counts', v_deleted_counts
  );
end;
$$;

create or replace function public.delete_company_safely(p_company_id text)
returns jsonb
language plpgsql
security definer
set search_path = admin, core, public, developer, projects, finance, harvest
as $$
declare
  v_company_uuid uuid;
begin
  if p_company_id is null or btrim(p_company_id) = '' then
    return jsonb_build_object('success', false, 'blocked', true, 'reason', 'Company id is required');
  end if;

  begin
    v_company_uuid := p_company_id::uuid;
  exception when invalid_text_representation then
    return jsonb_build_object(
      'success', false,
      'blocked', true,
      'reason', format('Invalid company id: %s', p_company_id)
    );
  end;

  return developer.delete_company_safely(v_company_uuid);
end;
$$;

grant execute on function developer.delete_company_safely(uuid) to authenticated;
grant execute on function public.delete_company_safely(text) to authenticated;

notify pgrst, 'reload schema';

commit;
