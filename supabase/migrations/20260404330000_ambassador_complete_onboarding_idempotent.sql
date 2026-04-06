-- Idempotent complete_my_ambassador_onboarding: no duplicate side effects if already finished.
begin;

create or replace function public.complete_my_ambassador_onboarding()
returns jsonb
language plpgsql
security definer
set search_path = public, core
as $$
declare
  v_clerk       text;
  v_id          uuid;
  n             int;
  v_has_company boolean;
  v_done        boolean;
begin
  v_clerk := nullif(trim(coalesce(core.current_user_id(), '')), '');
  if v_clerk is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select a.id, coalesce(a.onboarding_complete, false)
  into v_id, v_done
  from public.ambassadors a
  where a.clerk_user_id = v_clerk
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_done then
    return jsonb_build_object('ok', true, 'already_complete', true);
  end if;

  update public.ambassadors
  set onboarding_complete = true
  where id = v_id;

  get diagnostics n = row_count;
  if n = 0 then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  insert into public.ambassador_earnings (ambassador_id, amount, type, status, description)
  values (v_id, 200, 'signup_bonus', 'owed', 'Welcome bonus')
  on conflict (ambassador_id) where (type = 'signup_bonus') do nothing;

  select exists(
    select 1 from core.company_members m
    where m.clerk_user_id = v_clerk
  ) into v_has_company;

  update core.profiles
  set user_type  = case when v_has_company then 'both' else 'ambassador' end,
      updated_at = now()
  where clerk_user_id = v_clerk;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.complete_my_ambassador_onboarding() from public;
grant execute on function public.complete_my_ambassador_onboarding() to authenticated;

commit;
