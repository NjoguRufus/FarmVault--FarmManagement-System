-- Allow the same email as the signed-in account for company contact (not "another user").

begin;

drop function if exists public.validate_email_uniqueness(text, uuid);

create or replace function public.validate_email_uniqueness(
  _email text,
  _company_id uuid default null,
  _exclude_clerk_user_id text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = core, public
as $$
declare
  v_email text := public.normalize_email(_email);
  v_user_exists boolean := false;
  v_company_exists boolean := false;
  v_employee_exists boolean := false;
  v_excl text := nullif(trim(coalesce(_exclude_clerk_user_id, '')), '');
begin
  if nullif(v_email, '') is null then
    return jsonb_build_object('ok', false, 'message', 'Email is required');
  end if;

  -- "Another user" = profile with this email and a different clerk_user_id (or any profile if no exclude).
  select exists(
    select 1
    from core.profiles p
    where public.normalize_email(p.email) = v_email
      and (
        v_excl is null
        or nullif(trim(p.clerk_user_id), '') is distinct from v_excl
      )
  ) into v_user_exists;

  select exists(
    select 1 from core.companies c
    where public.normalize_email(c.email) = v_email
  ) into v_company_exists;

  if _company_id is not null then
    select exists(
      select 1 from public.employees e
      where e.company_id::text = _company_id::text
        and public.normalize_email(e.email) = v_email
    ) into v_employee_exists;
  end if;

  return jsonb_build_object(
    'ok', not (v_user_exists or v_company_exists or v_employee_exists),
    'user_exists', v_user_exists,
    'company_exists', v_company_exists,
    'employee_exists', v_employee_exists,
    'message', case
      when v_user_exists then 'This email is already used by another user.'
      when v_company_exists then 'This email is already used by another company.'
      when v_employee_exists then 'This email already exists in this company.'
      else null
    end
  );
end;
$$;

grant execute on function public.validate_email_uniqueness(text, uuid, text) to authenticated;

commit;

notify pgrst, 'reload schema';
