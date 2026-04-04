begin;

-- =============================================================================
-- Fix: remove references to auth_user_id in delete_user_safely.
-- The public.employees table uses clerk_user_id, not auth_user_id.
-- This replaces the function defined in 20260319000000_developer_safe_delete_user_company.sql.
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
    where clerk_user_id = p_clerk_user_id;
  end if;

  -- Optional: employees invited by email
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

  -- Block if important linked data exists
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

  -- Safe to delete
  if to_regclass('core.company_members') is not null then
    delete from core.company_members where clerk_user_id = p_clerk_user_id;
  end if;
  if to_regclass('public.employees') is not null then
    delete from public.employees
    where clerk_user_id = p_clerk_user_id
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

commit;
