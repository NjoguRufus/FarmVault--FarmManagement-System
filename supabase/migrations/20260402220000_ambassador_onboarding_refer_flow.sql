begin;

-- New ambassadors finish in-app onboarding before dashboard / refer tools.
create or replace function public.register_ambassador_for_clerk(
  p_name text,
  p_phone text,
  p_email text,
  p_type text,
  p_referrer_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, core
as $$
declare
  v_clerk text;
  v_existing record;
  v_parent uuid;
  v_id uuid;
  v_code text;
begin
  v_clerk := nullif(trim(coalesce(core.current_user_id(), '')), '');
  if v_clerk is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select a.id, a.referral_code
  into v_existing
  from public.ambassadors a
  where a.clerk_user_id = v_clerk
  limit 1;

  if found then
    return jsonb_build_object(
      'ok', true,
      'id', v_existing.id,
      'referral_code', v_existing.referral_code,
      'already_registered', true
    );
  end if;

  if p_type is null or p_type not in ('agrovet', 'farmer', 'company') then
    return jsonb_build_object('ok', false, 'error', 'invalid_type');
  end if;

  if p_name is null or length(trim(p_name)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'name_required');
  end if;

  v_parent := null;
  if p_referrer_code is not null and length(trim(p_referrer_code)) > 0 then
    v_parent := public.get_ambassador_id_by_referral_code(p_referrer_code);
  end if;

  insert into public.ambassadors (
    name,
    phone,
    email,
    type,
    clerk_user_id,
    referred_by,
    onboarding_complete
  )
  values (
    trim(p_name),
    nullif(trim(p_phone), ''),
    nullif(trim(p_email), ''),
    p_type,
    v_clerk,
    v_parent,
    false
  )
  returning id, referral_code into v_id, v_code;

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'referral_code', v_code,
    'already_registered', false
  );
exception
  when unique_violation then
    select a.id, a.referral_code into v_id, v_code
    from public.ambassadors a
    where a.clerk_user_id = v_clerk
    limit 1;
    if found then
      return jsonb_build_object(
        'ok', true,
        'id', v_id,
        'referral_code', v_code,
        'already_registered', true
      );
    end if;
    return jsonb_build_object('ok', false, 'error', 'conflict');
end;
$$;

-- Clerk-only: mark onboarding complete for the current user (no arbitrary uuid).
create or replace function public.complete_my_ambassador_onboarding()
returns jsonb
language plpgsql
security definer
set search_path = public, core
as $$
declare
  v_clerk text;
  n int;
begin
  v_clerk := nullif(trim(coalesce(core.current_user_id(), '')), '');
  if v_clerk is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  update public.ambassadors
  set onboarding_complete = true
  where clerk_user_id = v_clerk;

  get diagnostics n = row_count;
  if n = 0 then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.complete_my_ambassador_onboarding() from public;
grant execute on function public.complete_my_ambassador_onboarding() to authenticated;

commit;
