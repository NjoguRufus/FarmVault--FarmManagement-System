begin;

-- Line-level ambassador payouts and bonuses (dashboard totals source).
create table if not exists public.ambassador_earnings (
  id uuid primary key default gen_random_uuid(),
  ambassador_id uuid not null references public.ambassadors (id) on delete cascade,
  amount numeric not null check (amount >= 0),
  type text not null,
  status text not null check (status in ('owed', 'paid')),
  description text,
  created_at timestamptz not null default now()
);

create index if not exists idx_ambassador_earnings_ambassador
  on public.ambassador_earnings (ambassador_id);

create unique index if not exists ux_ambassador_earnings_signup_bonus
  on public.ambassador_earnings (ambassador_id)
  where type = 'signup_bonus';

alter table public.ambassador_earnings enable row level security;

-- One-time: existing ambassadors get welcome bonus row if missing.
insert into public.ambassador_earnings (ambassador_id, amount, type, status, description)
select a.id, 200, 'signup_bonus', 'owed', 'Welcome bonus'
from public.ambassadors a
where not exists (
  select 1
  from public.ambassador_earnings e
  where e.ambassador_id = a.id
    and e.type = 'signup_bonus'
);

-- Dashboard: referrals unchanged; money from ambassador_earnings.
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
  v_total_earned numeric;
  v_paid numeric;
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

  select
    coalesce(sum(e.amount) filter (where e.status in ('paid', 'owed')), 0),
    coalesce(sum(e.amount) filter (where e.status = 'paid'), 0),
    coalesce(sum(e.amount) filter (where e.status = 'owed'), 0)
  into v_total_earned, v_paid, v_owed
  from public.ambassador_earnings e
  where e.ambassador_id = p_ambassador_id;

  return jsonb_build_object(
    'ok', true,
    'name', v_name,
    'referral_code', v_code,
    'ambassador_active', v_amb_active,
    'onboarding_complete', v_onboarding_complete,
    'total_referrals', r_total,
    'active_referrals', r_active,
    'inactive_referrals', r_inactive,
    'total_earned', v_total_earned,
    'paid', v_paid,
    'owed', v_owed
  );
end;
$$;

-- Mark onboarding finished and grant signup bonus once.
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

commit;
