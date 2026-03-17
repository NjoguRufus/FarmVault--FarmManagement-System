-- Safe developer-only delete actions for Users and Companies
-- Implements: delete_user_safely, delete_company_safely with dependency checks,
-- protection of current session, and audit logging.

begin;

-- =============================================================================
-- 1) Developer delete audit table
-- =============================================================================
create table if not exists admin.developer_delete_audit (
  id uuid primary key default gen_random_uuid(),
  action text not null check (action in ('delete_user', 'delete_company')),
  target_id text not null,
  target_name text,
  actor_clerk_user_id text not null,
  success boolean not null,
  blocked_reason text,
  dependency_counts jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_developer_delete_audit_action
  on admin.developer_delete_audit(action);
create index if not exists idx_developer_delete_audit_created
  on admin.developer_delete_audit(created_at desc);
create index if not exists idx_developer_delete_audit_actor
  on admin.developer_delete_audit(actor_clerk_user_id);

comment on table admin.developer_delete_audit is 'Audit log for developer delete actions on users and companies';

-- RLS: only developers can read
alter table admin.developer_delete_audit enable row level security;
drop policy if exists developer_delete_audit_select on admin.developer_delete_audit;
create policy developer_delete_audit_select on admin.developer_delete_audit
  for select to authenticated using (admin.is_developer());

-- =============================================================================
-- 2) developer.delete_user_safely
-- =============================================================================
create or replace function developer.delete_user_safely(p_clerk_user_id text)
returns jsonb
language plpgsql
security definer
set search_path = admin, core, public, developer
as $$
declare
  v_actor text;
  v_profile_count int := 0;
  v_members_count int := 0;
  v_employees_count int := 0;
  v_employees_invited_count int := 0;
  v_alert_recipients_count int := 0;
  v_deps jsonb;
  v_email text;
  v_full_name text;
begin
  perform developer.assert_developer();
  v_actor := core.current_user_id();
  if v_actor is null then
    return jsonb_build_object(
      'success', false,
      'blocked', true,
      'reason', 'Not authenticated'
    );
  end if;

  -- Never allow deleting the current developer
  if p_clerk_user_id = v_actor then
    insert into admin.developer_delete_audit (
      action, target_id, target_name, actor_clerk_user_id, success, blocked_reason
    ) values (
      'delete_user', p_clerk_user_id, p_clerk_user_id, v_actor, false,
      'Cannot delete the currently logged-in developer'
    );
    return jsonb_build_object(
      'success', false,
      'blocked', true,
      'reason', 'Cannot delete the currently logged-in developer'
    );
  end if;

  -- Never allow deleting a developer
  if admin.is_developer(p_clerk_user_id) then
    insert into admin.developer_delete_audit (
      action, target_id, target_name, actor_clerk_user_id, success, blocked_reason
    ) values (
      'delete_user', p_clerk_user_id, p_clerk_user_id, v_actor, false,
      'Cannot delete a developer account'
    );
    return jsonb_build_object(
      'success', false,
      'blocked', true,
      'reason', 'Cannot delete a developer account'
    );
  end if;

  -- Get email/name for audit
  if to_regclass('core.profiles') is not null then
    select p.email, p.full_name into v_email, v_full_name
    from core.profiles p where p.clerk_user_id = p_clerk_user_id limit 1;
  end if;

  -- Count dependencies
  if to_regclass('core.profiles') is not null then
    select count(*) into v_profile_count from core.profiles where clerk_user_id = p_clerk_user_id;
  end if;
  if to_regclass('core.company_members') is not null then
    select count(*) into v_members_count from core.company_members where clerk_user_id = p_clerk_user_id;
  end if;
  if to_regclass('public.employees') is not null then
    select count(*) into v_employees_count from public.employees
    where clerk_user_id = p_clerk_user_id
       or (auth_user_id is not null and auth_user_id::text = p_clerk_user_id);
  end if;

  -- Optional: other tables that reference this user by clerk_user_id or email
  if to_regclass('public.employees') is not null and v_email is not null then
    select count(*) into v_employees_invited_count
    from public.employees
    where lower(coalesce(email, '')) = lower(v_email);
  end if;
  if to_regclass('public.alert_recipients') is not null then
    select count(*) into v_alert_recipients_count
    from public.alert_recipients
    where clerk_user_id = p_clerk_user_id;
  end if;

  v_deps := jsonb_build_object(
    'profiles', coalesce(v_profile_count, 0),
    'company_members', coalesce(v_members_count, 0),
    'employees', coalesce(v_employees_count, 0),
    'employees_by_email', coalesce(v_employees_invited_count, 0),
    'alert_recipients', coalesce(v_alert_recipients_count, 0)
  );

  -- Block if important linked data exists (company_members or employees = production use)
  if v_members_count > 0 or v_employees_count > 0 then
    insert into admin.developer_delete_audit (
      action, target_id, target_name, actor_clerk_user_id, success, blocked_reason, dependency_counts
    ) values (
      'delete_user', p_clerk_user_id, coalesce(v_full_name, v_email, p_clerk_user_id), v_actor, false,
      'User has linked company memberships or employee records. Deactivate or archive instead.',
      v_deps
    );
    return jsonb_build_object(
      'success', false,
      'blocked', true,
      'reason', 'User has linked company memberships or employee records. Deactivate or archive instead.',
      'dependency_counts', v_deps
    );
  end if;

  -- Safe to delete: remove from company_members first (cascade), then profiles
  if to_regclass('core.company_members') is not null then
    delete from core.company_members where clerk_user_id = p_clerk_user_id;
  end if;
  if to_regclass('public.employees') is not null then
    delete from public.employees
    where clerk_user_id = p_clerk_user_id
       or (auth_user_id is not null and auth_user_id::text = p_clerk_user_id)
       or (v_email is not null and lower(coalesce(email, '')) = lower(v_email));
  end if;
  if to_regclass('core.profiles') is not null then
    delete from core.profiles where clerk_user_id = p_clerk_user_id;
  end if;
  if to_regclass('public.profiles') is not null and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'clerk_user_id'
  ) then
    delete from public.profiles where clerk_user_id = p_clerk_user_id;
  end if;

  -- Alert recipients (per-company notification routing)
  if to_regclass('public.alert_recipients') is not null then
    delete from public.alert_recipients where clerk_user_id = p_clerk_user_id;
  end if;

  insert into admin.developer_delete_audit (
    action, target_id, target_name, actor_clerk_user_id, success, dependency_counts
  ) values (
    'delete_user', p_clerk_user_id, coalesce(v_full_name, v_email, p_clerk_user_id), v_actor, true, v_deps
  );

  return jsonb_build_object(
    'success', true,
    'blocked', false,
    'reason', null,
    'dependency_counts', v_deps,
    'note', 'App records deleted. External auth (Clerk) account deletion is separate.'
  );
end;
$$;

-- =============================================================================
-- 3) developer.delete_company_safely
-- =============================================================================
create or replace function developer.delete_company_safely(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = admin, core, public, developer, projects, finance, harvest
as $$
declare
  v_actor text;
  v_company_name text;
  v_active_refs int := 0;
  v_members int := 0;
  v_employees int := 0;
  v_projects int := 0;
  v_expenses int := 0;
  v_harvests int := 0;
  v_collections int := 0;
  v_pickers int := 0;
  v_inventory int := 0;
  v_suppliers int := 0;
  v_subscriptions int := 0;
  v_public_company_members int := 0;
  v_alert_company_recipients int := 0;
  v_deps jsonb;
  v_current_company uuid;
begin
  perform developer.assert_developer();
  v_actor := core.current_user_id();
  if v_actor is null then
    return jsonb_build_object('success', false, 'blocked', true, 'reason', 'Not authenticated');
  end if;

  -- Hard-protect core/system companies from deletion (e.g. KeyFarm tenant)
  if p_company_id::text in (
    'fa61d13d-3466-48db-a39c-4a474ccfed58' -- KeyFarm (production)
  ) then
    select c.name into v_company_name from core.companies c where c.id = p_company_id;
    insert into admin.developer_delete_audit (
      action, target_id, target_name, actor_clerk_user_id, success, blocked_reason
    ) values (
      'delete_company', p_company_id::text, v_company_name, v_actor, false,
      'This company is protected and cannot be deleted'
    );
    return jsonb_build_object(
      'success', false,
      'blocked', true,
      'reason', 'This company is protected and cannot be deleted'
    );
  end if;

  -- Never allow deleting the current developer's active company
  v_current_company := core.current_company_id();
  if v_current_company = p_company_id then
    select c.name into v_company_name from core.companies c where c.id = p_company_id;
    insert into admin.developer_delete_audit (
      action, target_id, target_name, actor_clerk_user_id, success, blocked_reason
    ) values (
      'delete_company', p_company_id::text, v_company_name, v_actor, false,
      'Cannot delete the currently active company of your session'
    );
    return jsonb_build_object(
      'success', false,
      'blocked', true,
      'reason', 'Cannot delete the currently active company of your session'
    );
  end if;

  select c.name into v_company_name from core.companies c where c.id = p_company_id;

  -- Count dependencies (use c.id::text for tables with text company_id)
  if to_regclass('core.company_members') is not null then
    select count(*) into v_members from core.company_members where company_id = p_company_id;
  end if;
  if to_regclass('core.profiles') is not null then
    select count(*) into v_active_refs from core.profiles where active_company_id = p_company_id;
  end if;
  if to_regclass('public.employees') is not null then
    select count(*) into v_employees from public.employees where company_id = p_company_id::text;
  end if;
  if to_regclass('projects.projects') is not null then
    select count(*) into v_projects from projects.projects where company_id = p_company_id;
  end if;
  if to_regclass('finance.expenses') is not null then
    select count(*) into v_expenses from finance.expenses where company_id = p_company_id;
  end if;
  if to_regclass('harvest.harvests') is not null then
    select count(*) into v_harvests from harvest.harvests where company_id = p_company_id;
  end if;
  if to_regclass('harvest.harvest_collections') is not null then
    select count(*) into v_collections from harvest.harvest_collections where company_id = p_company_id;
  end if;
  if to_regclass('harvest.harvest_pickers') is not null then
    select count(*) into v_pickers from harvest.harvest_pickers where company_id = p_company_id;
  end if;
  if to_regclass('public.inventory_items') is not null then
    select count(*) into v_inventory from public.inventory_items where company_id = p_company_id::text;
  end if;
  if to_regclass('public.suppliers') is not null then
    select count(*) into v_suppliers from public.suppliers where company_id = p_company_id::text;
  end if;
  if to_regclass('public.company_subscriptions') is not null then
    select count(*) into v_subscriptions from public.company_subscriptions where company_id = p_company_id;
  end if;

  if to_regclass('public.company_members') is not null then
    select count(*) into v_public_company_members from public.company_members where company_id::text = p_company_id::text;
  end if;
  if to_regclass('public.alert_recipients') is not null then
    select count(*) into v_alert_company_recipients from public.alert_recipients where company_id::text = p_company_id::text;
  end if;

  v_deps := jsonb_build_object(
    'company_members', coalesce(v_members, 0),
    'profiles_active_company', coalesce(v_active_refs, 0),
    'employees', coalesce(v_employees, 0),
    'projects', coalesce(v_projects, 0),
    'expenses', coalesce(v_expenses, 0),
    'harvests', coalesce(v_harvests, 0),
    'harvest_collections', coalesce(v_collections, 0),
    'harvest_pickers', coalesce(v_pickers, 0),
    'inventory_items', coalesce(v_inventory, 0),
    'suppliers', coalesce(v_suppliers, 0),
    'company_subscriptions', coalesce(v_subscriptions, 0),
    'public_company_members', coalesce(v_public_company_members, 0),
    'alert_company_recipients', coalesce(v_alert_company_recipients, 0)
  );

  -- Block if company has important linked data
  if (v_members + v_employees + v_projects + v_expenses + v_harvests + v_collections + v_pickers + v_inventory + v_suppliers + v_subscriptions) > 0 then
    insert into admin.developer_delete_audit (
      action, target_id, target_name, actor_clerk_user_id, success, blocked_reason, dependency_counts
    ) values (
      'delete_company', p_company_id::text, v_company_name, v_actor, false,
      'Company has linked data. Only empty/inactive/test companies can be hard-deleted. Consider archive instead.',
      v_deps
    );
    return jsonb_build_object(
      'success', false,
      'blocked', true,
      'reason', 'Company has linked data. Only empty/inactive/test companies can be hard-deleted. Consider archive instead.',
      'dependency_counts', v_deps
    );
  end if;

  -- Safe to delete: company is empty
  -- Clean up legacy/mirror tables that don't have FK cascades
  if to_regclass('public.company_members') is not null then
    delete from public.company_members where company_id::text = p_company_id::text;
  end if;
  if to_regclass('public.company_subscriptions') is not null then
    delete from public.company_subscriptions where company_id = p_company_id;
  end if;
  if to_regclass('public.alert_recipients') is not null then
    delete from public.alert_recipients where company_id::text = p_company_id::text;
  end if;
  if to_regclass('public.companies') is not null then
    delete from public.companies where id::text = p_company_id::text;
  end if;

  delete from core.companies where id = p_company_id;

  insert into admin.developer_delete_audit (
    action, target_id, target_name, actor_clerk_user_id, success, dependency_counts
  ) values (
    'delete_company', p_company_id::text, v_company_name, v_actor, true, v_deps
  );

  return jsonb_build_object(
    'success', true,
    'blocked', false,
    'reason', null,
    'dependency_counts', v_deps
  );
end;
$$;

-- =============================================================================
-- 4) Public wrappers and grants
-- =============================================================================
drop function if exists public.delete_user_safely(text);
create or replace function public.delete_user_safely(p_clerk_user_id text)
returns jsonb
language sql security definer as $$
  select developer.delete_user_safely(p_clerk_user_id);
$$;

drop function if exists public.delete_company_safely(uuid);
create or replace function public.delete_company_safely(p_company_id uuid)
returns jsonb
language sql security definer as $$
  select developer.delete_company_safely(p_company_id);
$$;

-- Text wrapper for convenience (casts to uuid)
drop function if exists public.delete_company_safely(text);
create or replace function public.delete_company_safely(p_company_id text)
returns jsonb
language sql security definer as $$
  select developer.delete_company_safely(p_company_id::uuid);
$$;

grant execute on function public.delete_user_safely(text) to authenticated;
grant execute on function public.delete_company_safely(uuid) to authenticated;
grant execute on function public.delete_company_safely(text) to authenticated;

commit;
