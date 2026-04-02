begin;

-- Referral rows: active vs inactive (for dashboard counts).
alter table public.referrals
  add column if not exists is_active boolean not null default true;

-- When a new ambassador is referred, record a referral row for the parent.
create or replace function public.ambassador_referred_by_referral()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.referred_by is not null then
    insert into public.referrals (referrer_id, referred_user_id, referred_user_type, level, is_active)
    values (new.referred_by, new.id, 'ambassador', 1, true);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ambassador_referral_link on public.ambassadors;
create trigger trg_ambassador_referral_link
after insert on public.ambassadors
for each row
execute procedure public.ambassador_referred_by_referral();

-- Dashboard: aggregate referrals + commissions for one ambassador (id is the session secret).
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
  r_total int;
  r_active int;
  r_inactive int;
  v_earned numeric;
  v_owed numeric;
begin
  select a.name, a.referral_code, a.is_active
  into v_name, v_code, v_amb_active
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
    'total_referrals', r_total,
    'active_referrals', r_active,
    'inactive_referrals', r_inactive,
    'total_earned', v_earned,
    'owed', v_owed
  );
end;
$$;

revoke all on function public.fetch_ambassador_dashboard_stats(uuid) from public;
grant execute on function public.fetch_ambassador_dashboard_stats(uuid) to anon, authenticated;

commit;
