begin;

create schema if not exists developer;

create or replace function public.company_exists(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = core, public
as $$
  select exists(select 1 from core.companies c where c.id = p_company_id);
$$;

grant execute on function public.company_exists(uuid) to authenticated;

create or replace function public.cleanup_orphaned_access(p_company_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = core, public, admin
as $$
declare
  v_user_id text := core.current_user_id();
  v_deleted_core_members int := 0;
  v_deleted_public_members int := 0;
  v_deleted_employees int := 0;
  v_profiles_cleared int := 0;
begin
  if v_user_id is null then
    return jsonb_build_object('cleaned', false, 'reason', 'Not authenticated');
  end if;

  if p_company_id is null then
    update core.profiles p
    set active_company_id = null
    where p.clerk_user_id = v_user_id
      and p.active_company_id is not null
      and not exists (select 1 from core.companies c where c.id = p.active_company_id);
  else
    update core.profiles p
    set active_company_id = null
    where p.clerk_user_id = v_user_id
      and p.active_company_id = p_company_id
      and not exists (select 1 from core.companies c where c.id = p_company_id);
  end if;
  get diagnostics v_profiles_cleared = row_count;

  if p_company_id is null then
    delete from core.company_members cm
    where cm.clerk_user_id = v_user_id
      and not exists (select 1 from core.companies c where c.id = cm.company_id);
  else
    delete from core.company_members cm
    where cm.clerk_user_id = v_user_id
      and cm.company_id = p_company_id
      and not exists (select 1 from core.companies c where c.id = p_company_id);
  end if;
  get diagnostics v_deleted_core_members = row_count;

  if to_regclass('public.company_members') is not null then
    if p_company_id is null then
      delete from public.company_members cm
      where cm.clerk_user_id = v_user_id
        and not exists (select 1 from core.companies c where c.id::text = cm.company_id::text);
    else
      delete from public.company_members cm
      where cm.clerk_user_id = v_user_id
        and cm.company_id::text = p_company_id::text
        and not exists (select 1 from core.companies c where c.id = p_company_id);
    end if;
    get diagnostics v_deleted_public_members = row_count;
  end if;

  if to_regclass('public.employees') is not null then
    if p_company_id is null then
      delete from public.employees e
      where e.clerk_user_id = v_user_id
        and not exists (select 1 from core.companies c where c.id::text = e.company_id::text);
    else
      delete from public.employees e
      where e.clerk_user_id = v_user_id
        and e.company_id::text = p_company_id::text
        and not exists (select 1 from core.companies c where c.id = p_company_id);
    end if;
    get diagnostics v_deleted_employees = row_count;
  end if;

  raise log '[AuthOrphan] Orphan cleanup executed: user_id=%, core_members=%, public_members=%, employees=%, profiles_cleared=%',
    v_user_id, v_deleted_core_members, v_deleted_public_members, v_deleted_employees, v_profiles_cleared;

  return jsonb_build_object(
    'cleaned', true,
    'deleted_counts', jsonb_build_object(
      'core_company_members', v_deleted_core_members,
      'public_company_members', v_deleted_public_members,
      'employees', v_deleted_employees,
      'profiles_cleared', v_profiles_cleared
    )
  );
end;
$$;

grant execute on function public.cleanup_orphaned_access(uuid) to authenticated;

create or replace function developer.delete_company_safely(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = admin, core, public, developer, projects, finance, harvest
as $$
declare
  v_actor text;
  v_company_name text;
  v_current_company uuid;
  v_deleted_counts jsonb := '{}'::jsonb;
  v_count int := 0;
begin
  perform developer.assert_developer();
  v_actor := core.current_user_id();
  if v_actor is null then
    return jsonb_build_object('success', false, 'blocked', true, 'reason', 'Not authenticated');
  end if;

  if p_company_id::text in ('fa61d13d-3466-48db-a39c-4a474ccfed58') then
    select c.name into v_company_name from core.companies c where c.id = p_company_id;
    return jsonb_build_object(
      'success', false,
      'blocked', true,
      'reason', 'This company is protected and cannot be deleted'
    );
  end if;

  v_current_company := core.current_company_id();
  if v_current_company = p_company_id then
    return jsonb_build_object(
      'success', false,
      'blocked', true,
      'reason', 'Cannot delete the currently active company of your session'
    );
  end if;

  select c.name into v_company_name from core.companies c where c.id = p_company_id;

  if to_regclass('public.employee_project_access') is not null then
    delete from public.employee_project_access where company_id::text = p_company_id::text;
    get diagnostics v_count = row_count;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('employee_project_access', v_count);
  end if;

  if to_regclass('public.alert_recipients') is not null then
    delete from public.alert_recipients where company_id::text = p_company_id::text;
    get diagnostics v_count = row_count;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('alert_recipients', v_count);
  end if;

  if to_regclass('public.employee_invites') is not null then
    delete from public.employee_invites where company_id::text = p_company_id::text;
    get diagnostics v_count = row_count;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('employee_invites', v_count);
  end if;
  if to_regclass('public.pending_invites') is not null then
    delete from public.pending_invites where company_id::text = p_company_id::text;
    get diagnostics v_count = row_count;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('pending_invites', v_count);
  end if;
  if to_regclass('public.invitations') is not null then
    delete from public.invitations where company_id::text = p_company_id::text;
    get diagnostics v_count = row_count;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('invitations', v_count);
  end if;

  if to_regclass('public.employees') is not null then
    delete from public.employees where company_id::text = p_company_id::text;
    get diagnostics v_count = row_count;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('employees', v_count);
  end if;
  if to_regclass('public.company_members') is not null then
    delete from public.company_members where company_id::text = p_company_id::text;
    get diagnostics v_count = row_count;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('public_company_members', v_count);
  end if;
  if to_regclass('core.company_members') is not null then
    delete from core.company_members where company_id = p_company_id;
    get diagnostics v_count = row_count;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('core_company_members', v_count);
  end if;

  if to_regclass('core.profiles') is not null then
    update core.profiles set active_company_id = null where active_company_id = p_company_id;
    get diagnostics v_count = row_count;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('profiles_active_company_cleared', v_count);
  end if;

  if to_regclass('projects.projects') is not null then
    delete from projects.projects where company_id = p_company_id;
    get diagnostics v_count = row_count;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('projects', v_count);
  end if;
  if to_regclass('finance.expenses') is not null then
    delete from finance.expenses where company_id = p_company_id;
    get diagnostics v_count = row_count;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('expenses', v_count);
  end if;
  if to_regclass('harvest.harvest_pickers') is not null then
    delete from harvest.harvest_pickers where company_id = p_company_id;
    get diagnostics v_count = row_count;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('harvest_pickers', v_count);
  end if;
  if to_regclass('harvest.harvest_collections') is not null then
    delete from harvest.harvest_collections where company_id = p_company_id;
    get diagnostics v_count = row_count;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('harvest_collections', v_count);
  end if;
  if to_regclass('harvest.harvests') is not null then
    delete from harvest.harvests where company_id = p_company_id;
    get diagnostics v_count = row_count;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('harvests', v_count);
  end if;

  if to_regclass('public.inventory_items') is not null then
    delete from public.inventory_items where company_id::text = p_company_id::text;
    get diagnostics v_count = row_count;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('inventory_items', v_count);
  end if;
  if to_regclass('public.suppliers') is not null then
    delete from public.suppliers where company_id::text = p_company_id::text;
    get diagnostics v_count = row_count;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('suppliers', v_count);
  end if;
  if to_regclass('public.records') is not null then
    delete from public.records where company_id::text = p_company_id::text;
    get diagnostics v_count = row_count;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('records', v_count);
  end if;
  if to_regclass('public.admin_alerts') is not null then
    delete from public.admin_alerts where company_id::text = p_company_id::text;
    get diagnostics v_count = row_count;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('admin_alerts', v_count);
  end if;
  if to_regclass('public.billing_confirmations') is not null then
    delete from public.billing_confirmations where company_id::text = p_company_id::text;
    get diagnostics v_count = row_count;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('billing_confirmations', v_count);
  end if;
  if to_regclass('public.company_subscriptions') is not null then
    delete from public.company_subscriptions where company_id::text = p_company_id::text;
    get diagnostics v_count = row_count;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('company_subscriptions', v_count);
  end if;
  if to_regclass('public.companies') is not null then
    delete from public.companies where id::text = p_company_id::text;
    get diagnostics v_count = row_count;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('public_companies', v_count);
  end if;

  delete from core.companies where id = p_company_id;
  get diagnostics v_count = row_count;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('core_companies', v_count);

  insert into admin.developer_delete_audit (
    action, target_id, target_name, actor_clerk_user_id, success, dependency_counts
  ) values (
    'delete_company', p_company_id::text, v_company_name, v_actor, true, v_deleted_counts
  );

  raise log '[DevDelete] Company deleted with cleanup: company_id=%, actor=%, counts=%',
    p_company_id::text, v_actor, v_deleted_counts::text;

  return jsonb_build_object(
    'success', true,
    'blocked', false,
    'reason', null,
    'deleted_counts', v_deleted_counts
  );
end;
$$;

drop function if exists public.delete_company_safely(uuid);
create or replace function public.delete_company_safely(p_company_id uuid)
returns jsonb
language sql security definer as $$
  select developer.delete_company_safely(p_company_id);
$$;

drop function if exists public.delete_company_safely(text);
create or replace function public.delete_company_safely(p_company_id text)
returns jsonb
language sql security definer as $$
  select developer.delete_company_safely(p_company_id::uuid);
$$;

grant execute on function developer.delete_company_safely(uuid) to authenticated;
grant execute on function public.delete_company_safely(uuid) to authenticated;
grant execute on function public.delete_company_safely(text) to authenticated;

commit;
