-- Developer-only read: fetch a project by id (bypasses tenant RLS via SECURITY DEFINER)
-- Safe: read-only, no policy changes, no table changes.

create or replace function public.developer_get_project_by_id(p_project_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, admin
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
  from public.projects p
  where p.id = p_project_id
  limit 1;

  return v_out;
end;
$$;

grant execute on function public.developer_get_project_by_id(uuid) to authenticated;

notify pgrst, 'reload schema';

