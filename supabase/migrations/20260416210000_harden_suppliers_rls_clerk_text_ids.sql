begin;

-- Harden legacy public helper functions so Clerk user IDs (user_*) are never cast to uuid.
-- This removes 22P02 errors during suppliers RLS checks in mixed-schema deployments.
-- NOTE: Keep public.current_company_id() return type unchanged (uuid) to avoid 42P13.

create or replace function public.current_company_id_text()
returns text
language plpgsql
stable
security definer
set search_path = public, core, admin
as $$
declare
  v_company_uuid uuid;
  v_company_text text;
  v_user text;
begin
  -- Prefer canonical core resolver when available.
  begin
    v_company_uuid := core.current_company_id();
  exception
    when others then
      v_company_uuid := null;
  end;

  if v_company_uuid is not null then
    return v_company_uuid::text;
  end if;

  -- Fallback to Clerk user id lookup without auth.uid() uuid assumptions.
  begin
    v_user := nullif(trim(coalesce(core.current_user_id(), '')), '');
  exception
    when others then
      v_user := null;
  end;

  if v_user is null then
    return null;
  end if;

  -- core.profiles(clerk_user_id) path
  begin
    select p.active_company_id::text
      into v_company_text
    from core.profiles p
    where p.clerk_user_id = v_user
    limit 1;
  exception
    when others then
      v_company_text := null;
  end;

  if nullif(trim(coalesce(v_company_text, '')), '') is not null then
    return trim(v_company_text);
  end if;

  -- public.profiles(clerk_user_id/company_id) compatibility path
  begin
    select nullif(trim(coalesce(p.company_id::text, '')), '')
      into v_company_text
    from public.profiles p
    where coalesce(nullif(trim(coalesce(p.clerk_user_id::text, '')), ''), nullif(trim(coalesce(p.user_id::text, '')), '')) = v_user
    limit 1;
  exception
    when others then
      v_company_text := null;
  end;

  return nullif(trim(coalesce(v_company_text, '')), '');
end;
$$;

create or replace function public.is_developer()
returns boolean
language plpgsql
stable
security definer
set search_path = public, core, admin
as $$
begin
  begin
    return admin.is_developer();
  exception
    when others then
      return false;
  end;
end;
$$;

create or replace function public.row_company_matches_user(row_company_id text)
returns boolean
language sql
stable
security definer
as $$
  select
    (row_company_id is not null and row_company_id::text = public.current_company_id_text()::text)
    or (public.current_company_id_text() is null and row_company_id is null);
$$;

-- Recreate suppliers policy with explicit public-qualified helpers.
alter table if exists public.suppliers enable row level security;

drop policy if exists suppliers_policy on public.suppliers;
create policy suppliers_policy
  on public.suppliers
  for all
  using (
    public.is_developer()
    or public.row_company_matches_user(company_id::text)
  )
  with check (
    auth.uid() is not null
    and (
      company_id::text = public.current_company_id_text()::text
      or public.is_developer()
    )
  );

grant execute on function public.current_company_id_text() to authenticated, anon;
grant execute on function public.is_developer() to authenticated, anon;
grant execute on function public.row_company_matches_user(text) to authenticated, anon;

commit;

notify pgrst, 'reload schema';
