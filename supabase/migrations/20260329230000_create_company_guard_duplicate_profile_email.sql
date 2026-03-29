-- Block create_company_with_admin when another profile already owns this user's normalized email (different clerk id).

begin;

create or replace function core.create_company_with_admin(
  _name text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = core, public
as $$
declare
  v_user_id    text;
  v_company_id uuid;
  v_trim       text;
  v_self_email text;
  v_norm_self  text;
  v_other_exists boolean;
begin
  v_user_id := core.current_user_id();
  if v_user_id is null then
    raise exception 'create_company_with_admin: unauthenticated' using errcode = '28000';
  end if;

  v_trim := trim(coalesce(_name, ''));
  if length(v_trim) < 2 then
    raise exception 'Company name is required (at least 2 characters).' using errcode = '23514';
  end if;

  select nullif(trim(p.email), '') into v_self_email
  from core.profiles p
  where p.clerk_user_id = v_user_id
  limit 1;

  if v_self_email is not null then
    v_norm_self := public.normalize_email(v_self_email);
    if v_norm_self is not null and length(v_norm_self) > 0 then
      select exists(
        select 1
        from core.profiles p2
        where public.normalize_email(p2.email) = v_norm_self
          and nullif(trim(p2.clerk_user_id), '') is distinct from v_user_id
      ) into v_other_exists;

      if v_other_exists then
        raise exception 'This email is already linked to an existing FarmVault account. Please sign in with that account instead of creating a new company.'
          using errcode = '23505';
      end if;
    end if;
  end if;

  insert into core.companies (name, created_by)
  values (v_trim, v_user_id)
  returning id into v_company_id;

  insert into core.profiles (clerk_user_id, active_company_id, created_at, updated_at)
  values (v_user_id, v_company_id, now(), now())
  on conflict (clerk_user_id) do update
    set active_company_id = excluded.active_company_id,
        updated_at        = now();

  insert into core.company_members (company_id, clerk_user_id, role)
  values (v_company_id, v_user_id, 'company_admin')
  on conflict (company_id, clerk_user_id) do update
    set role = excluded.role;

  return v_company_id;
end;
$$;

create or replace function core.create_company_and_admin(
  _name text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = core, public
as $$
declare
  v_user_id    text;
  v_company_id uuid;
  v_trim       text;
  v_self_email text;
  v_norm_self  text;
  v_other_exists boolean;
begin
  v_user_id := core.current_user_id();
  if v_user_id is null then
    raise exception 'create_company_and_admin: unauthenticated' using errcode = '28000';
  end if;

  v_trim := trim(coalesce(_name, ''));
  if length(v_trim) < 2 then
    raise exception 'Company name is required (at least 2 characters).' using errcode = '23514';
  end if;

  select nullif(trim(p.email), '') into v_self_email
  from core.profiles p
  where p.clerk_user_id = v_user_id
  limit 1;

  if v_self_email is not null then
    v_norm_self := public.normalize_email(v_self_email);
    if v_norm_self is not null and length(v_norm_self) > 0 then
      select exists(
        select 1
        from core.profiles p2
        where public.normalize_email(p2.email) = v_norm_self
          and nullif(trim(p2.clerk_user_id), '') is distinct from v_user_id
      ) into v_other_exists;

      if v_other_exists then
        raise exception 'This email is already linked to an existing FarmVault account. Please sign in with that account instead of creating a new company.'
          using errcode = '23505';
      end if;
    end if;
  end if;

  insert into core.companies (name, created_by)
  values (v_trim, v_user_id)
  returning id into v_company_id;

  insert into core.profiles (clerk_user_id, active_company_id, created_at, updated_at)
  values (v_user_id, v_company_id, now(), now())
  on conflict (clerk_user_id) do update
    set active_company_id = excluded.active_company_id,
        updated_at        = now();

  insert into core.company_members (company_id, clerk_user_id, role)
  values (v_company_id, v_user_id, 'company_admin')
  on conflict (company_id, clerk_user_id) do update
    set role = excluded.role;

  return v_company_id;
end;
$$;

commit;

notify pgrst, 'reload schema';
