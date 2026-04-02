-- Notebook RPC + company_records RLS evaluate public.is_developer() while scanning rows.
-- If admin.is_developer() is still the broken 20260316100000 variant (calls auth.uid()),
-- Postgres raises 22P02 invalid uuid "" (or fails on Clerk sub) before the RPC body runs.
--
-- Canonical zero-arg admin.is_developer(): core.current_user_id / clerk_user_id only — never auth.uid().

begin;

create or replace function admin.is_developer()
returns boolean
language plpgsql
stable
security definer
set search_path = admin, core, public
as $$
declare
  v_user text;
  v_is_dev boolean := false;
begin
  begin
    v_user := nullif(trim(coalesce(core.current_user_id(), '')), '');
  exception
    when others then
      v_user := null;
  end;

  if v_user is null then
    begin
      v_user := nullif(trim(coalesce(public.current_clerk_id(), '')), '');
    exception
      when others then
        v_user := null;
    end;
  end if;

  if v_user is null then
    return false;
  end if;

  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'admin'
      and table_name = 'developers'
  ) then
    return false;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'admin'
      and table_name = 'developers'
      and column_name = 'clerk_user_id'
  ) then
    select exists (
      select 1
      from admin.developers d
      where d.clerk_user_id = v_user
        and (d.is_active is null or d.is_active = true)
    )
    into v_is_dev;
    return coalesce(v_is_dev, false);
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'admin'
      and table_name = 'developers'
      and column_name = 'user_id'
  ) then
    begin
      return exists (
        select 1
        from admin.developers d
        where d.user_id = v_user::uuid
          and (d.is_active is null or d.is_active = true)
      );
    exception
      when invalid_text_representation then
        return false;
    end;
  end if;

  return false;
end;
$$;

create or replace function public.is_developer()
returns boolean
language plpgsql
stable
security definer
set search_path = admin, core, public
as $$
begin
  return admin.is_developer();
end;
$$;

grant execute on function admin.is_developer() to authenticated;
grant execute on function public.is_developer() to authenticated;

commit;

notify pgrst, 'reload schema';
