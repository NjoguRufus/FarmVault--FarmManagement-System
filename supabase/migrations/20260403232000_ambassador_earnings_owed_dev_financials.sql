begin;

-- Correct signup bonus: owed until developer marks paid.
update public.ambassador_earnings e
set status = 'owed'
where e.type = 'signup_bonus'
  and e.status = 'paid';

-- Onboarding bonus rows use owed.
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

  insert into public.ambassador_earnings (ambassador_id, amount, type, status, description)
  values (p_ambassador_id, 200, 'signup_bonus', 'owed', 'Welcome bonus')
  on conflict (ambassador_id) where (type = 'signup_bonus') do nothing;
end;
$$;

create or replace function public.complete_my_ambassador_onboarding()
returns jsonb
language plpgsql
security definer
set search_path = public, core
as $$
declare
  v_clerk text;
  v_id uuid;
  n int;
begin
  v_clerk := nullif(trim(coalesce(core.current_user_id(), '')), '');
  if v_clerk is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select a.id into v_id
  from public.ambassadors a
  where a.clerk_user_id = v_clerk
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
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

  return jsonb_build_object('ok', true);
end;
$$;

-- Ambassador: list by id (legacy session storage).
create or replace function public.fetch_ambassador_earnings_transactions(p_ambassador_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if p_ambassador_id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  if not exists (select 1 from public.ambassadors a where a.id = p_ambassador_id) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  return jsonb_build_object(
    'ok', true,
    'rows', coalesce((
      select jsonb_agg(row_obj order by sort_at desc)
      from (
        select
          e.created_at as sort_at,
          jsonb_build_object(
            'id', e.id,
            'created_at', e.created_at,
            'description', coalesce(e.description, ''),
            'type', e.type,
            'amount', e.amount,
            'status', e.status
          ) as row_obj
        from public.ambassador_earnings e
        where e.ambassador_id = p_ambassador_id
      ) sub
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.fetch_ambassador_earnings_transactions(uuid) from public;
grant execute on function public.fetch_ambassador_earnings_transactions(uuid) to anon, authenticated;

-- Ambassador: list own earnings (Clerk session).
create or replace function public.fetch_my_ambassador_earnings_transactions()
returns jsonb
language plpgsql
security definer
set search_path = public, core
stable
as $$
declare
  v_clerk text;
  v_id uuid;
begin
  v_clerk := nullif(trim(coalesce(core.current_user_id(), '')), '');
  if v_clerk is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select a.id into v_id
  from public.ambassadors a
  where a.clerk_user_id = v_clerk
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  return public.fetch_ambassador_earnings_transactions(v_id);
end;
$$;

revoke all on function public.fetch_my_ambassador_earnings_transactions() from public;
grant execute on function public.fetch_my_ambassador_earnings_transactions() to authenticated;

-- Developer: mark all owed earnings for one ambassador as paid.
create or replace function public.dev_mark_ambassador_earnings_paid(p_ambassador_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  if not public.is_developer() then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  if p_ambassador_id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  if not exists (select 1 from public.ambassadors a where a.id = p_ambassador_id) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  update public.ambassador_earnings e
  set status = 'paid'
  where e.ambassador_id = p_ambassador_id
    and e.status = 'owed';

  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'updated', n);
end;
$$;

revoke all on function public.dev_mark_ambassador_earnings_paid(uuid) from public;
grant execute on function public.dev_mark_ambassador_earnings_paid(uuid) to authenticated;

-- Developer read earnings lines (detail page).
drop policy if exists ambassador_earnings_developer_select on public.ambassador_earnings;
create policy ambassador_earnings_developer_select on public.ambassador_earnings
  for select
  to authenticated
  using (public.is_developer());

create or replace view public.dev_ambassador_earnings as
select
  e.id as earning_id,
  e.ambassador_id,
  e.amount,
  e.type as earning_type,
  e.status,
  e.description,
  e.created_at
from public.ambassador_earnings e;

comment on view public.dev_ambassador_earnings is 'Line-level ambassador earnings for developer tools.';

grant select on public.dev_ambassador_earnings to authenticated;

-- Global + per-ambassador stats from ambassador_earnings (not legacy commissions).
create or replace view public.dev_global_referral_stats as
select
  (select count(*)::bigint from public.ambassadors) as total_ambassadors,
  (select count(*)::bigint from public.ambassadors a where a.is_active) as active_ambassadors,
  (select count(*)::bigint from public.ambassadors a where not a.is_active) as inactive_ambassadors,
  coalesce((select sum(e.amount) from public.ambassador_earnings e where e.status = 'owed'), 0)::numeric as total_owed,
  coalesce((select sum(e.amount) from public.ambassador_earnings e where e.status = 'paid'), 0)::numeric as total_paid_out;

comment on view public.dev_global_referral_stats is 'Ambassador counts + program-wide earnings owed/paid.';

create or replace view public.dev_referral_conversion as
select
  a.id,
  a.name,
  a.type,
  a.referral_code,
  coalesce(rstats.total_referrals, 0)::bigint as total_referrals,
  coalesce(rstats.active_referrals, 0)::bigint as active_referrals,
  coalesce(rstats.inactive_referrals, 0)::bigint as inactive_referrals,
  case
    when coalesce(rstats.total_referrals, 0) = 0 then 0::numeric
    else round(
      (coalesce(rstats.active_referrals, 0)::numeric / rstats.total_referrals::numeric) * 100,
      2
    )
  end as conversion_rate,
  coalesce(estats.total_earned, 0)::numeric as total_earned,
  coalesce(estats.owed, 0)::numeric as owed,
  coalesce(estats.paid, 0)::numeric as paid
from public.ambassadors a
left join lateral (
  select
    count(*)::bigint as total_referrals,
    count(*) filter (where coalesce(r.is_active, true))::bigint as active_referrals,
    count(*) filter (where not coalesce(r.is_active, true))::bigint as inactive_referrals
  from public.referrals r
  where r.referrer_id = a.id
) rstats on true
left join lateral (
  select
    coalesce(sum(e.amount) filter (where e.status in ('paid', 'owed')), 0) as total_earned,
    coalesce(sum(e.amount) filter (where e.status = 'owed'), 0) as owed,
    coalesce(sum(e.amount) filter (where e.status = 'paid'), 0) as paid
  from public.ambassador_earnings e
  where e.ambassador_id = a.id
) estats on true;

comment on view public.dev_referral_conversion is 'Per-ambassador referral funnel + ambassador_earnings totals.';

-- Realtime refetch when earnings change.
do $pub$
begin
  begin
    alter publication supabase_realtime add table public.ambassador_earnings;
  exception
    when duplicate_object then null;
  end;
end
$pub$;

alter table public.ambassador_earnings replica identity full;

commit;
