begin;

-- ============================================================
-- 0. Add paid_at column if not already present
-- ============================================================
alter table public.ambassador_earnings
  add column if not exists paid_at timestamptz;

-- ============================================================
-- 1. Data fix: any signup_bonus row accidentally marked paid → owed
-- ============================================================
update public.ambassador_earnings
set status = 'owed'
where type = 'signup_bonus'
  and status = 'paid';

-- ============================================================
-- 2. Backfill: ambassadors with no signup_bonus row yet
-- ============================================================
insert into public.ambassador_earnings (ambassador_id, amount, type, status, description)
select a.id, 200, 'signup_bonus', 'owed', 'Welcome bonus'
from public.ambassadors a
where not exists (
  select 1
  from public.ambassador_earnings e
  where e.ambassador_id = a.id
    and e.type = 'signup_bonus'
);

-- ============================================================
-- 3. register_ambassador_for_clerk — grant signup bonus as owed
--    on NEW registration so the row exists immediately, even if
--    the onboarding wizard is never fully completed.
-- ============================================================
create or replace function public.register_ambassador_for_clerk(
  p_name          text,
  p_phone         text,
  p_email         text,
  p_type          text,
  p_referrer_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, core
as $$
declare
  v_clerk    text;
  v_existing record;
  v_parent   uuid;
  v_id       uuid;
  v_code     text;
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

  -- Signup bonus is owed from the moment the ambassador is created.
  insert into public.ambassador_earnings (ambassador_id, amount, type, status, description)
  values (v_id, 200, 'signup_bonus', 'owed', 'Welcome bonus')
  on conflict (ambassador_id) where (type = 'signup_bonus') do nothing;

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

revoke all on function public.register_ambassador_for_clerk(text, text, text, text, text) from public;
grant execute on function public.register_ambassador_for_clerk(text, text, text, text, text) to authenticated;

-- ============================================================
-- 4. complete_ambassador_onboarding — idempotent bonus insert
-- ============================================================
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

revoke all on function public.complete_ambassador_onboarding(uuid) from public;
grant execute on function public.complete_ambassador_onboarding(uuid) to anon, authenticated;

-- ============================================================
-- 5. complete_my_ambassador_onboarding — idempotent bonus insert
-- ============================================================
create or replace function public.complete_my_ambassador_onboarding()
returns jsonb
language plpgsql
security definer
set search_path = public, core
as $$
declare
  v_clerk text;
  v_id    uuid;
  n       int;
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

revoke all on function public.complete_my_ambassador_onboarding() from public;
grant execute on function public.complete_my_ambassador_onboarding() to authenticated;

-- ============================================================
-- 6. fetch_ambassador_earnings_transactions (ambassador-facing)
-- ============================================================
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
            'id',          e.id,
            'created_at',  e.created_at,
            'description', coalesce(e.description, ''),
            'type',        e.type,
            'amount',      e.amount,
            'status',      e.status
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

-- ============================================================
-- 7. fetch_my_ambassador_earnings_transactions (Clerk session)
-- ============================================================
create or replace function public.fetch_my_ambassador_earnings_transactions()
returns jsonb
language plpgsql
security definer
set search_path = public, core
stable
as $$
declare
  v_clerk text;
  v_id    uuid;
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

-- ============================================================
-- 8. Developer: mark all owed earnings for one ambassador as paid
-- ============================================================
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

  update public.ambassador_earnings
  set status  = 'paid',
      paid_at = now()
  where ambassador_id = p_ambassador_id
    and status = 'owed';

  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'updated', n);
end;
$$;

revoke all on function public.dev_mark_ambassador_earnings_paid(uuid) from public;
grant execute on function public.dev_mark_ambassador_earnings_paid(uuid) to authenticated;

-- ============================================================
-- 9. RLS: developers can read all ambassador_earnings rows
-- ============================================================
drop policy if exists ambassador_earnings_developer_select on public.ambassador_earnings;
create policy ambassador_earnings_developer_select on public.ambassador_earnings
  for select
  to authenticated
  using (public.is_developer());

-- ============================================================
-- 10. dev_ambassador_earnings view (detail page earnings table)
-- ============================================================
create or replace view public.dev_ambassador_earnings as
select
  e.id           as earning_id,
  e.ambassador_id,
  e.amount,
  e.type         as earning_type,
  e.status,
  e.description,
  e.created_at
from public.ambassador_earnings e;

comment on view public.dev_ambassador_earnings is
  'Line-level ambassador earnings for developer detail page.';

grant select on public.dev_ambassador_earnings to authenticated;

-- ============================================================
-- 11. dev_global_referral_stats — ambassador counts + money totals
--     aggregated from ambassador_earnings (not commissions).
-- ============================================================
create or replace view public.dev_global_referral_stats as
select
  (select count(*)::bigint  from public.ambassadors)                               as total_ambassadors,
  (select count(*)::bigint  from public.ambassadors a where a.is_active)           as active_ambassadors,
  (select count(*)::bigint  from public.ambassadors a where not a.is_active)       as inactive_ambassadors,
  coalesce(
    (select sum(e.amount) from public.ambassador_earnings e where e.status = 'owed'),
    0
  )::numeric                                                                        as total_owed,
  coalesce(
    (select sum(e.amount) from public.ambassador_earnings e where e.status = 'paid'),
    0
  )::numeric                                                                        as total_paid_out;

comment on view public.dev_global_referral_stats is
  'Single-row program-wide totals: ambassador counts + owed/paid from ambassador_earnings.';

grant select on public.dev_global_referral_stats to authenticated;

-- ============================================================
-- 12. dev_referral_conversion — per-ambassador funnel + earnings
--     aggregated from ambassador_earnings (not commissions).
-- ============================================================
create or replace view public.dev_referral_conversion as
select
  a.id,
  a.name,
  a.type,
  a.referral_code,
  coalesce(rstats.total_referrals,    0)::bigint  as total_referrals,
  coalesce(rstats.active_referrals,   0)::bigint  as active_referrals,
  coalesce(rstats.inactive_referrals, 0)::bigint  as inactive_referrals,
  case
    when coalesce(rstats.total_referrals, 0) = 0 then 0::numeric
    else round(
      (coalesce(rstats.active_referrals, 0)::numeric
        / rstats.total_referrals::numeric) * 100,
      2
    )
  end                                              as conversion_rate,
  coalesce(estats.total_earned, 0)::numeric        as total_earned,
  coalesce(estats.owed,         0)::numeric        as owed,
  coalesce(estats.paid,         0)::numeric        as paid
from public.ambassadors a
left join lateral (
  select
    count(*)::bigint                                            as total_referrals,
    count(*) filter (where  coalesce(r.is_active, true))::bigint as active_referrals,
    count(*) filter (where not coalesce(r.is_active, true))::bigint as inactive_referrals
  from public.referrals r
  where r.referrer_id = a.id
) rstats on true
left join lateral (
  select
    coalesce(sum(e.amount) filter (where e.status in ('paid', 'owed')), 0) as total_earned,
    coalesce(sum(e.amount) filter (where e.status = 'owed'),            0) as owed,
    coalesce(sum(e.amount) filter (where e.status = 'paid'),            0) as paid
  from public.ambassador_earnings e
  where e.ambassador_id = a.id
) estats on true;

comment on view public.dev_referral_conversion is
  'Per-ambassador referral funnel + ambassador_earnings totals for developer dashboard.';

grant select on public.dev_referral_conversion to authenticated;

-- ============================================================
-- 13. Realtime: publish ambassador_earnings so views refetch
-- ============================================================
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
