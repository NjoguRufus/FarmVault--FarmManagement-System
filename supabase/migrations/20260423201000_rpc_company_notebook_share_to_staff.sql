-- Allow company admins to send a notebook-style message to one staff member (Clerk id),
-- stored like developer USER-target admin notes so staff see it via rpc_list_farm_notebook_admin_notes.

begin;

create or replace function public.rpc_company_send_farm_notebook_note_to_user(
  p_company_id text,
  p_target_user_id text,
  p_title text,
  p_content text
)
returns uuid
language plpgsql
security definer
set search_path = public, core
as $$
declare
  v_company uuid;
  v_target text;
  v_actor text;
  v_id uuid;
begin
  begin
    v_company := nullif(trim(coalesce(p_company_id, '')), '')::uuid;
  exception
    when others then
      raise exception 'invalid company_id' using errcode = 'P0001';
  end;

  v_target := nullif(trim(coalesce(p_target_user_id, '')), '');

  if v_company is null then
    raise exception 'company_id is required' using errcode = 'P0001';
  end if;

  if v_target is null then
    raise exception 'target_user_id is required' using errcode = 'P0001';
  end if;

  if not (public.fv_is_developer() or core.is_company_admin(v_company)) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.employees e
    where e.company_id = v_company
      and e.clerk_user_id is not null
      and trim(e.clerk_user_id) = v_target
      and e.status = 'active'
  ) then
    raise exception 'target is not an active employee of this company' using errcode = 'P0001';
  end if;

  v_actor := nullif(trim(coalesce(core.current_user_id(), '')), '');

  insert into public.farm_notebook_admin_notes (
    title,
    content,
    crop_id,
    company_id,
    target_user_id,
    target_type,
    created_by_admin,
    created_by_user_id
  )
  values (
    coalesce(p_title, ''),
    coalesce(p_content, ''),
    null,
    v_company::text,
    v_target,
    'USER'::public.notebook_note_target_type,
    true,
    v_actor
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.rpc_company_send_farm_notebook_note_to_user(text, text, text, text) to authenticated;

notify pgrst, 'reload schema';

commit;
