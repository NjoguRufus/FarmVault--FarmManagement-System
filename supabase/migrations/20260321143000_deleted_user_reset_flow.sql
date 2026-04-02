begin;

create schema if not exists admin;

create table if not exists admin.reset_users (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text,
  email text,
  deleted_at timestamptz not null default now(),
  deleted_by text,
  allow_resignup boolean not null default true,
  is_active boolean not null default true,
  reactivated_at timestamptz,
  reactivated_by text,
  note text
);

create index if not exists idx_reset_users_clerk_user_id on admin.reset_users(clerk_user_id);
create index if not exists idx_reset_users_email on admin.reset_users(lower(coalesce(email, '')));
create index if not exists idx_reset_users_active on admin.reset_users(is_active, deleted_at desc);

alter table admin.reset_users enable row level security;

drop policy if exists reset_users_select_developer on admin.reset_users;
create policy reset_users_select_developer
on admin.reset_users
for select
to authenticated
using (admin.is_developer(auth.uid()));

create or replace function public.get_reset_user_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = admin, core, public
as $$
declare
  v_user_id text := core.current_user_id();
  v_email text;
  v_row admin.reset_users%rowtype;
begin
  begin
    v_email := lower(nullif(trim((current_setting('request.jwt.claims', true)::jsonb ->> 'email')), ''));
  exception when others then
    v_email := null;
  end;

  select r.*
  into v_row
  from admin.reset_users r
  where r.is_active = true
    and (
      (v_user_id is not null and r.clerk_user_id = v_user_id)
      or (v_email is not null and lower(coalesce(r.email, '')) = v_email)
    )
  order by r.deleted_at desc
  limit 1;

  if v_row.id is null then
    return jsonb_build_object(
      'has_reset_row', false,
      'is_blocked', false,
      'allow_resignup', true
    );
  end if;

  return jsonb_build_object(
    'has_reset_row', true,
    'is_blocked', true,
    'allow_resignup', coalesce(v_row.allow_resignup, true),
    'deleted_at', v_row.deleted_at,
    'deleted_by', v_row.deleted_by
  );
end;
$$;

create or replace function public.consume_reset_user_for_signup()
returns jsonb
language plpgsql
security definer
set search_path = admin, core, public
as $$
declare
  v_user_id text := core.current_user_id();
  v_email text;
  v_row admin.reset_users%rowtype;
begin
  begin
    v_email := lower(nullif(trim((current_setting('request.jwt.claims', true)::jsonb ->> 'email')), ''));
  exception when others then
    v_email := null;
  end;

  select r.*
  into v_row
  from admin.reset_users r
  where r.is_active = true
    and (
      (v_user_id is not null and r.clerk_user_id = v_user_id)
      or (v_email is not null and lower(coalesce(r.email, '')) = v_email)
    )
  order by r.deleted_at desc
  limit 1;

  if v_row.id is null then
    return jsonb_build_object('found', false, 'consumed', false, 'allowed', true);
  end if;

  if coalesce(v_row.allow_resignup, true) = false then
    return jsonb_build_object('found', true, 'consumed', false, 'allowed', false);
  end if;

  update admin.reset_users
  set
    is_active = false,
    reactivated_at = now(),
    reactivated_by = v_user_id
  where id = v_row.id;

  raise log '[AuthReset] Consumed reset tombstone for re-signup: user_id=%, email=%', v_user_id, v_email;

  return jsonb_build_object('found', true, 'consumed', true, 'allowed', true);
end;
$$;

grant execute on function public.get_reset_user_state() to authenticated;
grant execute on function public.consume_reset_user_for_signup() to authenticated;

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
  v_public_members_count int := 0;
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

  if to_regclass('core.profiles') is not null then
    select p.email, p.full_name into v_email, v_full_name
    from core.profiles p where p.clerk_user_id = p_clerk_user_id limit 1;
  end if;

  if to_regclass('core.profiles') is not null then
    select count(*) into v_profile_count from core.profiles where clerk_user_id = p_clerk_user_id;
  end if;
  if to_regclass('core.company_members') is not null then
    select count(*) into v_members_count from core.company_members where clerk_user_id = p_clerk_user_id;
  end if;
  if to_regclass('public.company_members') is not null then
    select count(*) into v_public_members_count from public.company_members where clerk_user_id = p_clerk_user_id;
  end if;
  if to_regclass('public.employees') is not null then
    select count(*) into v_employees_count from public.employees
    where clerk_user_id = p_clerk_user_id
       or (auth_user_id is not null and auth_user_id::text = p_clerk_user_id);
  end if;
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
    'core_company_members', coalesce(v_members_count, 0),
    'public_company_members', coalesce(v_public_members_count, 0),
    'employees', coalesce(v_employees_count, 0),
    'employees_by_email', coalesce(v_employees_invited_count, 0),
    'alert_recipients', coalesce(v_alert_recipients_count, 0)
  );

  update admin.reset_users
  set is_active = false
  where is_active = true
    and (
      clerk_user_id = p_clerk_user_id
      or (v_email is not null and lower(coalesce(email, '')) = lower(v_email))
    );

  insert into admin.reset_users (
    clerk_user_id,
    email,
    deleted_by,
    allow_resignup,
    is_active,
    deleted_at,
    note
  ) values (
    p_clerk_user_id,
    v_email,
    v_actor,
    true,
    true,
    now(),
    'Developer deleted user app records'
  );

  if to_regclass('public.alert_recipients') is not null then
    delete from public.alert_recipients where clerk_user_id = p_clerk_user_id;
  end if;
  if to_regclass('core.company_members') is not null then
    delete from core.company_members where clerk_user_id = p_clerk_user_id;
  end if;
  if to_regclass('public.company_members') is not null then
    delete from public.company_members where clerk_user_id = p_clerk_user_id;
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

  if to_regclass('public.pending_invites') is not null then
    delete from public.pending_invites where (v_email is not null and lower(coalesce(email, '')) = lower(v_email));
  end if;
  if to_regclass('public.employee_invites') is not null then
    delete from public.employee_invites where (v_email is not null and lower(coalesce(email, '')) = lower(v_email));
  end if;
  if to_regclass('public.invitations') is not null then
    delete from public.invitations where (v_email is not null and lower(coalesce(email, '')) = lower(v_email));
  end if;
  if to_regclass('public.user_company_mappings') is not null then
    delete from public.user_company_mappings where clerk_user_id = p_clerk_user_id;
  end if;

  raise log '[DevDelete] User app records deleted with reset tombstone: target_user_id=%, actor=%', p_clerk_user_id, v_actor;

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
    'note', 'App records deleted and reset tombstone created. External auth (Clerk) account deletion is separate.'
  );
end;
$$;

grant execute on function developer.delete_user_safely(text) to authenticated;
grant execute on function public.delete_user_safely(text) to authenticated;

commit;
