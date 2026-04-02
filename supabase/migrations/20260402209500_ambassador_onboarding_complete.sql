begin;

alter table public.ambassadors
  add column if not exists onboarding_complete boolean not null default false;

-- Include onboarding flag in ambassador dashboard payload.
create or replace function public.fetch_ambassador_dashboard_stats(p_ambassador_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_code text;
  v_amb_active boolean;
  v_onboarding_complete boolean;
  r_total int;
  r_active int;
  r_inactive int;
  v_earned numeric;
  v_owed numeric;
begin
  select a.name, a.referral_code, a.is_active, coalesce(a.onboarding_complete, false)
  into v_name, v_code, v_amb_active, v_onboarding_complete
  from public.ambassadors a
  where a.id = p_ambassador_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select count(*)::int into r_total from public.referrals r where r.referrer_id = p_ambassador_id;
  select count(*)::int into r_active from public.referrals r where r.referrer_id = p_ambassador_id and r.is_active = true;
  select count(*)::int into r_inactive from public.referrals r where r.referrer_id = p_ambassador_id and r.is_active = false;

  select coalesce(sum(c.amount), 0) into v_owed
  from public.commissions c
  where c.referrer_id = p_ambassador_id and c.status = 'owed';

  select coalesce(sum(c.amount), 0) into v_earned
  from public.commissions c
  where c.referrer_id = p_ambassador_id and c.status = 'paid';

  return jsonb_build_object(
    'ok', true,
    'name', v_name,
    'referral_code', v_code,
    'ambassador_active', v_amb_active,
    'onboarding_complete', v_onboarding_complete,
    'total_referrals', r_total,
    'active_referrals', r_active,
    'inactive_referrals', r_inactive,
    'total_earned', v_earned,
    'owed', v_owed
  );
end;
$$;

-- Mark onboarding finished (session id is the capability).
create or replace function public.complete_ambassador_onboarding(p_ambassador_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.ambassadors
  set onboarding_complete = true
  where id = p_ambassador_id;
end;
$$;

revoke all on function public.complete_ambassador_onboarding(uuid) from public;
grant execute on function public.complete_ambassador_onboarding(uuid) to anon, authenticated;

commit;
