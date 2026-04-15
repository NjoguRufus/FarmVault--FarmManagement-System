-- Ambassador wallet v2: welcome_bonus KES 300 (locked until first farmer payment),
-- farmer_bonus KES 600 + unlocked welcome become available immediately on first payment,
-- balance cache counts pending+locked as pending_balance. Removes legacy type "signup".

begin;

-- ---------------------------------------------------------------------------
-- 1) Ledger type: welcome_bonus (replace signup)
-- ---------------------------------------------------------------------------
drop index if exists public.ux_ar_comm_signup_one;

alter table public.ambassador_revenue_commissions
  drop constraint if exists ambassador_revenue_commissions_type_check;

update public.ambassador_revenue_commissions
set type = 'welcome_bonus'
where type = 'signup';

alter table public.ambassador_revenue_commissions
  add constraint ambassador_revenue_commissions_type_check
  check (type in ('welcome_bonus', 'farmer_bonus', 'monthly'));

create unique index if not exists ux_ar_comm_welcome_one
  on public.ambassador_revenue_commissions (ambassador_id)
  where type = 'welcome_bonus';

-- Normalize welcome rows: KES 300, locked while waiting for first referred payment
update public.ambassador_revenue_commissions c
set
  amount = 300,
  status = case
    when c.status = 'available' then c.status
    when c.status = 'paid' then c.status
    else 'locked'
  end
where c.type = 'welcome_bonus';

-- ---------------------------------------------------------------------------
-- 2) Balance cache: pending = sum(pending + locked), total = all non-zero paths
-- ---------------------------------------------------------------------------
create or replace function public.refresh_ambassador_balance_cache(p_ambassador_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pending_like numeric;
  v_avail_comm numeric;
  v_paid_comm numeric;
  v_pending_wd numeric;
  v_paid_wd numeric;
  v_total numeric;
begin
  if p_ambassador_id is null then
    return;
  end if;

  select
    coalesce(sum(c.amount) filter (where c.status in ('pending', 'locked')), 0),
    coalesce(sum(c.amount) filter (where c.status = 'available'), 0),
    coalesce(sum(c.amount) filter (where c.status = 'paid'), 0)
  into v_pending_like, v_avail_comm, v_paid_comm
  from public.ambassador_revenue_commissions c
  where c.ambassador_id = p_ambassador_id;

  select
    coalesce(sum(w.amount) filter (where w.status in ('pending', 'approved')), 0),
    coalesce(sum(w.amount) filter (where w.status = 'paid'), 0)
  into v_pending_wd, v_paid_wd
  from public.ambassador_withdrawals w
  where w.ambassador_id = p_ambassador_id;

  v_total := v_pending_like + v_avail_comm + v_paid_comm;

  update public.ambassadors a
  set
    pending_balance = v_pending_like,
    reserved_withdrawal_balance = v_pending_wd,
    available_balance = greatest(v_avail_comm - v_pending_wd - v_paid_wd, 0),
    total_earnings = v_total
  where a.id = p_ambassador_id;
end;
$$;

comment on column public.ambassadors.pending_balance is
  'Non-withdrawable ledger total: commissions in pending or locked (incl. KES 300 welcome until first farmer payment, and monthly lines before release).';
comment on column public.ambassadors.total_earnings is
  'Lifetime total from ambassador_revenue_commissions: pending + locked + available + paid.';

-- ---------------------------------------------------------------------------
-- 3) First payment: unlock welcome to available; farmer_bonus available immediately
-- ---------------------------------------------------------------------------
create or replace function public.award_subscription_commission(
  p_company_id uuid,
  p_receipt_number text
)
returns jsonb
language plpgsql
security definer
set search_path = public, core
as $$
declare
  v_amb uuid;
  v_ref uuid;
  v_receipt text;
  v_tx_id uuid;
  v_signup_unlocked int := 0;
  v_first_payment boolean := false;
begin
  if p_company_id is null then
    return jsonb_build_object('ok', false, 'error', 'missing_company');
  end if;

  v_receipt := nullif(trim(coalesce(p_receipt_number, '')), '');
  if v_receipt is null then
    return jsonb_build_object('ok', false, 'error', 'missing_receipt');
  end if;

  select c.referred_by_ambassador_id
  into v_amb
  from core.companies c
  where c.id = p_company_id;

  if v_amb is null then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'no_ambassador');
  end if;

  select r.id
  into v_ref
  from public.referrals r
  where r.referrer_id = v_amb
    and r.referred_user_type = 'company'
    and r.referred_user_id = p_company_id
  order by r.created_at asc
  limit 1;

  if v_ref is null then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'no_referral');
  end if;

  select (r.first_revenue_at is null)
  into v_first_payment
  from public.referrals r
  where r.id = v_ref;

  insert into public.ambassador_transactions (
    ambassador_id,
    company_id,
    receipt_number,
    type,
    amount,
    status,
    description,
    referral_id
  )
  values (
    v_amb,
    p_company_id,
    v_receipt,
    'subscription_commission',
    600,
    'owed',
    'Farmer workspace subscription (revenue-triggered)',
    v_ref
  )
  on conflict (company_id, receipt_number) do nothing
  returning id into v_tx_id;

  if v_tx_id is null then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'duplicate_receipt');
  end if;

  insert into public.ambassador_revenue_commissions (
    ambassador_id,
    farmer_company_id,
    referral_id,
    type,
    amount,
    status,
    release_date,
    approved_for_payout,
    idempotency_key
  )
  values (
    v_amb,
    p_company_id,
    v_ref,
    'farmer_bonus',
    600,
    'available',
    now(),
    true,
    v_receipt
  );

  update public.ambassador_revenue_commissions c
  set
    status = 'available',
    release_date = coalesce(c.release_date, now()),
    approved_for_payout = true
  where c.ambassador_id = v_amb
    and c.type = 'welcome_bonus'
    and c.status in ('pending', 'locked');

  get diagnostics v_signup_unlocked = row_count;

  update public.referrals r
  set
    first_subscription_paid = true,
    first_revenue_at = coalesce(r.first_revenue_at, now()),
    last_verified_payment_at = now(),
    referral_status = case
      when r.referral_status = 'commissioned' then r.referral_status
      else 'subscribed'
    end,
    subscribed_at = coalesce(r.subscribed_at, now()),
    last_activity_at = now(),
    is_active = true
  where r.id = v_ref;

  perform public.refresh_ambassador_balance_cache(v_amb);
  perform public.promote_ambassador_commission_releases();

  return jsonb_build_object(
    'ok', true,
    'amount', 600::numeric,
    'first_subscription_payment', coalesce(v_first_payment, false),
    'welcome_unlocked', v_signup_unlocked > 0
  );
end;
$$;

comment on function public.award_subscription_commission(uuid, text) is
  'KES 600 farmer bonus per verified subscription receipt (idempotent). Unlocks KES 300 welcome_bonus to available on first referred payment. Monthly KES 500 via process_ambassador_monthly_commissions.';

-- ---------------------------------------------------------------------------
-- 4) Onboarding completion: welcome_bonus 300 locked
-- ---------------------------------------------------------------------------
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

  insert into public.ambassador_revenue_commissions (
    ambassador_id,
    farmer_company_id,
    referral_id,
    type,
    amount,
    status,
    release_date,
    approved_for_payout
  )
  values (
    p_ambassador_id,
    null,
    null,
    'welcome_bonus',
    300,
    'locked',
    null,
    false
  )
  on conflict (ambassador_id) where (type = 'welcome_bonus') do nothing;
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

  insert into public.ambassador_revenue_commissions (
    ambassador_id,
    farmer_company_id,
    referral_id,
    type,
    amount,
    status,
    release_date,
    approved_for_payout
  )
  values (
    v_id,
    null,
    null,
    'welcome_bonus',
    300,
    'locked',
    null,
    false
  )
  on conflict (ambassador_id) where (type = 'welcome_bonus') do nothing;

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) Dashboard stats (refresh cache first)
-- ---------------------------------------------------------------------------
create or replace function public.fetch_ambassador_dashboard_stats(p_ambassador_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, core
as $$
declare
  v_name text;
  v_code text;
  v_amb_active boolean;
  v_onboarding_complete boolean;
  r_total int;
  r_active int;
  r_inactive int;
  v_paying_farmers int;
  v_monthly_run_rate numeric;
  v_paid_withdrawals numeric;
  v_total_earned numeric;
  v_pending numeric;
  v_available numeric;
  v_legacy_total numeric;
  v_legacy_paid numeric;
  v_legacy_owed numeric;
begin
  perform public.refresh_ambassador_balance_cache(p_ambassador_id);

  select a.name, a.referral_code, a.is_active, coalesce(a.onboarding_complete, false),
         coalesce(a.total_earnings, 0),
         coalesce(a.pending_balance, 0),
         coalesce(a.available_balance, 0)
  into v_name, v_code, v_amb_active, v_onboarding_complete, v_total_earned, v_pending, v_available
  from public.ambassadors a
  where a.id = p_ambassador_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select count(*)::int into r_total from public.referrals r where r.referrer_id = p_ambassador_id;
  select count(*)::int into r_active from public.referrals r where r.referrer_id = p_ambassador_id and r.is_active = true;
  select count(*)::int into r_inactive from public.referrals r where r.referrer_id = p_ambassador_id and r.is_active = false;

  select count(*)::int into v_paying_farmers
  from public.referrals r
  inner join public.company_subscriptions s on s.company_id = r.referred_user_id
  where r.referrer_id = p_ambassador_id
    and r.referred_user_type = 'company'
    and lower(trim(coalesce(s.status, ''))) = 'active'
    and coalesce(s.is_trial, false) = false;

  v_monthly_run_rate := 500::numeric * coalesce(v_paying_farmers, 0);

  select coalesce(sum(w.amount) filter (where w.status = 'paid'), 0)
  into v_paid_withdrawals
  from public.ambassador_withdrawals w
  where w.ambassador_id = p_ambassador_id;

  select
    coalesce(sum(e.amount) filter (where e.status in ('paid', 'owed')), 0),
    coalesce(sum(e.amount) filter (where e.status = 'paid'), 0),
    coalesce(sum(e.amount) filter (where e.status = 'owed'), 0)
  into v_legacy_total, v_legacy_paid, v_legacy_owed
  from public.ambassador_earnings e
  where e.ambassador_id = p_ambassador_id
    and e.type not in ('subscription_commission', 'farmer_subscription_commission');

  return jsonb_build_object(
    'ok', true,
    'name', v_name,
    'referral_code', v_code,
    'ambassador_active', v_amb_active,
    'onboarding_complete', v_onboarding_complete,
    'total_referrals', r_total,
    'active_referrals', r_active,
    'inactive_referrals', r_inactive,
    'total_earned', v_total_earned + v_legacy_total,
    'paid', v_paid_withdrawals + v_legacy_paid,
    'owed', v_pending + v_legacy_owed,
    'pending_earnings', v_pending + v_legacy_owed,
    'available_balance', v_available,
    'active_paying_farmers', v_paying_farmers,
    'monthly_recurring_income_kes', v_monthly_run_rate
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 6) Referral rows: treat pending ledger lines as owed / in progress
-- ---------------------------------------------------------------------------
create or replace function public.fetch_ambassador_referral_rows(p_ambassador_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, core
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
          r.created_at as sort_at,
          jsonb_build_object(
            'referral_id', r.id,
            'name', coalesce(
              nullif(trim(amb.name), ''),
              nullif(trim(comp.name), ''),
              initcap(r.referred_user_type::text)
            ),
            'type', r.referred_user_type,
            'status', case when coalesce(r.is_active, true) then 'active' else 'inactive' end,
            'referral_status', coalesce(r.referral_status, 'signed_up'),
            'date', r.created_at,
            'last_activity_at', r.last_activity_at,
            'subscription_status', case
              when r.referred_user_type = 'company' then
                case
                  when coalesce(sub.is_trial, false) and coalesce(sub.status::text, '') = 'active' then 'trial'
                  when coalesce(sub.status::text, '') = 'active' then 'paid'
                  else coalesce(sub.status::text, 'none')
                end
              else null
            end,
            'commission_status', case
              when exists (
                select 1 from public.ambassador_revenue_commissions c
                where c.referral_id = r.id
                  and c.status = 'paid'
              ) then 'paid'
              when exists (
                select 1 from public.ambassador_revenue_commissions c
                where c.referral_id = r.id
                  and c.status in ('locked', 'available', 'pending')
              ) then 'owed'
              when exists (
                select 1 from public.ambassador_earnings e
                where e.referral_id = r.id
                  and e.type in ('farmer_subscription_commission', 'subscription_commission')
                  and e.status = 'paid'
              ) then 'paid'
              when exists (
                select 1 from public.ambassador_earnings e
                where e.referral_id = r.id
                  and e.type in ('farmer_subscription_commission', 'subscription_commission')
                  and e.status = 'owed'
              ) then 'owed'
              else 'none'
            end,
            'commission', coalesce((
              select sum(c.amount)::numeric
              from public.ambassador_revenue_commissions c
              where c.referral_id = r.id
            ), 0) + coalesce((
              select sum(c.amount)::numeric
              from public.commissions c
              where c.referrer_id = p_ambassador_id
                and c.user_id is not distinct from r.referred_user_id
            ), 0) + coalesce((
              select sum(e.amount)::numeric
              from public.ambassador_earnings e
              where e.ambassador_id = p_ambassador_id
                and e.referral_id = r.id
                and e.type not in ('subscription_commission', 'farmer_subscription_commission')
            ), 0)
          ) as row_obj
        from public.referrals r
        left join public.ambassadors amb
          on r.referred_user_type = 'ambassador' and amb.id = r.referred_user_id
        left join core.companies comp
          on r.referred_user_type = 'company' and comp.id = r.referred_user_id
        left join public.company_subscriptions sub
          on r.referred_user_type = 'company' and sub.company_id = r.referred_user_id
        where r.referrer_id = p_ambassador_id
      ) sub
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 7) Transactions list: welcome_bonus label
-- ---------------------------------------------------------------------------
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
          c.created_at as sort_at,
          jsonb_build_object(
            'id', c.id,
            'created_at', c.created_at,
            'description', case c.type
              when 'welcome_bonus' then 'Welcome bonus (KES 300)'
              when 'farmer_bonus' then 'Farmer payment bonus'
              when 'monthly' then 'Monthly recurring commission'
              else coalesce(c.type, '')
            end,
            'type', c.type,
            'amount', c.amount,
            'status', case c.status
              when 'pending' then 'pending'
              when 'locked' then 'pending'
              when 'available' then 'available'
              when 'paid' then 'paid'
              else c.status
            end,
            'release_date', c.release_date
          ) as row_obj
        from public.ambassador_revenue_commissions c
        where c.ambassador_id = p_ambassador_id
        union all
        select
          e.created_at as sort_at,
          jsonb_build_object(
            'id', e.id,
            'created_at', e.created_at,
            'description', coalesce(e.description, ''),
            'type', e.type,
            'amount', e.amount,
            'status', e.status,
            'release_date', null
          ) as row_obj
        from public.ambassador_earnings e
        where e.ambassador_id = p_ambassador_id
          and e.type not in ('subscription_commission', 'farmer_subscription_commission')
      ) sub
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 8) Backfill: every ambassador gets at most one welcome_bonus row
-- ---------------------------------------------------------------------------
insert into public.ambassador_revenue_commissions (
  ambassador_id,
  farmer_company_id,
  referral_id,
  type,
  amount,
  status,
  release_date,
  approved_for_payout
)
select
  a.id,
  null,
  null,
  'welcome_bonus',
  300,
  'locked',
  null,
  false
from public.ambassadors a
where coalesce(a.onboarding_complete, false) = true
  and not exists (
    select 1
    from public.ambassador_revenue_commissions c
    where c.ambassador_id = a.id
      and c.type = 'welcome_bonus'
  );

do $bf$
declare
  r record;
begin
  for r in select id from public.ambassadors
  loop
    perform public.refresh_ambassador_balance_cache(r.id);
  end loop;
end;
$bf$;

commit;

notify pgrst, 'reload schema';
