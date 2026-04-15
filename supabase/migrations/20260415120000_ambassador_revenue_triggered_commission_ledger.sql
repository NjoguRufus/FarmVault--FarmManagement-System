-- Revenue-triggered ambassador commissions (KES): signup 600 (pending until first farmer payment),
-- KES 600 per verified farmer/workspace payment, KES 500/month recurring from the month AFTER first payment.
-- Ledger: public.ambassador_revenue_commissions (status pending|locked|available|paid).
-- Balances on public.ambassadors are refreshed from the ledger + open withdrawals.
-- Supersedes per-renewal subscription amounts in award_subscription_commission (still idempotent on company_id + receipt).

begin;

-- ---------------------------------------------------------------------------
-- 1) Referrals: first verified revenue timestamps
-- ---------------------------------------------------------------------------
alter table public.referrals
  add column if not exists first_revenue_at timestamptz,
  add column if not exists last_verified_payment_at timestamptz;

comment on column public.referrals.first_revenue_at is
  'First successful referred workspace subscription payment (Africa/Nairobi business date may apply downstream).';
comment on column public.referrals.last_verified_payment_at is
  'Latest successful referred workspace subscription payment.';

-- ---------------------------------------------------------------------------
-- 2) Ambassadors: cached balances + payout delay
-- ---------------------------------------------------------------------------
alter table public.ambassadors
  add column if not exists total_earnings numeric not null default 0 check (total_earnings >= 0),
  add column if not exists pending_balance numeric not null default 0 check (pending_balance >= 0),
  add column if not exists available_balance numeric not null default 0 check (available_balance >= 0),
  add column if not exists reserved_withdrawal_balance numeric not null default 0 check (reserved_withdrawal_balance >= 0),
  add column if not exists commission_release_delay_days int not null default 7 check (commission_release_delay_days between 1 and 14);

comment on column public.ambassadors.total_earnings is
  'Lifetime recognized commissions (locked + available + paid in ambassador_revenue_commissions; excludes signup pending).';
comment on column public.ambassadors.pending_balance is
  'Sum of commission lines in status locked (earned, not yet withdrawable).';
comment on column public.ambassadors.available_balance is
  'Withdrawable after subtracting open withdrawal requests (pending/approved).';
comment on column public.ambassadors.reserved_withdrawal_balance is
  'Amount tied up in withdrawal requests with status pending or approved.';

-- ---------------------------------------------------------------------------
-- 3) Commission ledger (canonical; avoids clobbering legacy public.commissions)
-- ---------------------------------------------------------------------------
create table if not exists public.ambassador_revenue_commissions (
  id uuid primary key default gen_random_uuid(),
  ambassador_id uuid not null references public.ambassadors (id) on delete cascade,
  farmer_company_id uuid references core.companies (id) on delete set null,
  referral_id uuid references public.referrals (id) on delete set null,
  type text not null check (type in ('signup', 'farmer_bonus', 'monthly')),
  amount numeric not null check (amount >= 0),
  status text not null default 'pending' check (status in ('pending', 'locked', 'available', 'paid')),
  release_date timestamptz,
  approved_for_payout boolean not null default true,
  idempotency_key text,
  billing_month date,
  created_at timestamptz not null default now()
);

create index if not exists idx_ar_comm_ambassador_created
  on public.ambassador_revenue_commissions (ambassador_id, created_at desc);

create unique index if not exists ux_ar_comm_signup_one
  on public.ambassador_revenue_commissions (ambassador_id)
  where type = 'signup';

create unique index if not exists ux_ar_comm_farmer_receipt
  on public.ambassador_revenue_commissions (farmer_company_id, idempotency_key)
  where type = 'farmer_bonus' and farmer_company_id is not null and idempotency_key is not null;

create unique index if not exists ux_ar_comm_monthly_period
  on public.ambassador_revenue_commissions (ambassador_id, farmer_company_id, billing_month)
  where type = 'monthly' and farmer_company_id is not null and billing_month is not null;

alter table public.ambassador_revenue_commissions enable row level security;
revoke all on public.ambassador_revenue_commissions from public;
grant all on public.ambassador_revenue_commissions to service_role;

-- ---------------------------------------------------------------------------
-- 4) Withdrawals
-- ---------------------------------------------------------------------------
create table if not exists public.ambassador_withdrawals (
  id uuid primary key default gen_random_uuid(),
  ambassador_id uuid not null references public.ambassadors (id) on delete cascade,
  amount numeric not null check (amount >= 2000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'paid')),
  notes text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create index if not exists idx_ambassador_withdrawals_ambassador
  on public.ambassador_withdrawals (ambassador_id, created_at desc);

alter table public.ambassador_withdrawals enable row level security;
revoke all on public.ambassador_withdrawals from public;
grant all on public.ambassador_withdrawals to service_role;

-- ---------------------------------------------------------------------------
-- 5) Balance cache refresh
-- ---------------------------------------------------------------------------
create or replace function public.refresh_ambassador_balance_cache(p_ambassador_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_locked numeric;
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
    coalesce(sum(c.amount) filter (where c.status = 'locked'), 0),
    coalesce(sum(c.amount) filter (where c.status = 'available'), 0),
    coalesce(sum(c.amount) filter (where c.status = 'paid'), 0)
  into v_locked, v_avail_comm, v_paid_comm
  from public.ambassador_revenue_commissions c
  where c.ambassador_id = p_ambassador_id;

  select
    coalesce(sum(w.amount) filter (where w.status in ('pending', 'approved')), 0),
    coalesce(sum(w.amount) filter (where w.status = 'paid'), 0)
  into v_pending_wd, v_paid_wd
  from public.ambassador_withdrawals w
  where w.ambassador_id = p_ambassador_id;

  v_total := v_locked + v_avail_comm + v_paid_comm;

  update public.ambassadors a
  set
    pending_balance = v_locked,
    reserved_withdrawal_balance = v_pending_wd,
    available_balance = greatest(v_avail_comm - v_pending_wd - v_paid_wd, 0),
    total_earnings = v_total
  where a.id = p_ambassador_id;
end;
$$;

revoke all on function public.refresh_ambassador_balance_cache(uuid) from public;
grant execute on function public.refresh_ambassador_balance_cache(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 6) Promote locked -> available after hold + approval
-- ---------------------------------------------------------------------------
create or replace function public.promote_ambassador_commission_releases()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_promoted_rows int := 0;
  v_amb_ids uuid[];
  v_id uuid;
begin
  with promoted as (
    update public.ambassador_revenue_commissions c
    set status = 'available'
    where c.status = 'locked'
      and coalesce(c.approved_for_payout, false) = true
      and c.release_date is not null
      and c.release_date <= now()
    returning c.ambassador_id
  )
  select
    (select count(*)::int from promoted),
    coalesce(
      (
        select array_agg(d.ambassador_id)
        from (select distinct ambassador_id from promoted) d
      ),
      array[]::uuid[]
    )
  into v_promoted_rows, v_amb_ids;

  if v_amb_ids is not null then
    foreach v_id in array v_amb_ids loop
      perform public.refresh_ambassador_balance_cache(v_id);
    end loop;
  end if;

  return jsonb_build_object(
    'ok', true,
    'promoted_rows', v_promoted_rows,
    'ambassadors_refreshed', coalesce(cardinality(v_amb_ids), 0)
  );
end;
$$;

revoke all on function public.promote_ambassador_commission_releases() from public;
grant execute on function public.promote_ambassador_commission_releases() to service_role;

-- ---------------------------------------------------------------------------
-- 7) Monthly recurring (KES 500) — not in the same calendar month as first revenue
-- ---------------------------------------------------------------------------
create or replace function public.process_ambassador_monthly_commissions(p_anchor timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public, core
as $$
declare
  v_inserted int := 0;
  v_month_start date;
  r record;
begin
  v_month_start := (date_trunc('month', timezone('Africa/Nairobi', p_anchor)))::date;

  for r in
    select
      ref.id as referral_id,
      ref.referrer_id as ambassador_id,
      ref.referred_user_id as company_id,
      coalesce(ref.first_revenue_at, ref.subscribed_at) as first_rev
    from public.referrals ref
    inner join public.company_subscriptions sub
      on sub.company_id = ref.referred_user_id
    where ref.referred_user_type = 'company'
      and lower(trim(coalesce(sub.status, ''))) = 'active'
      and coalesce(sub.is_trial, false) = false
      and coalesce(ref.first_revenue_at, ref.subscribed_at) is not null
      and date_trunc('month', timezone('Africa/Nairobi', coalesce(ref.first_revenue_at, ref.subscribed_at))) <
          date_trunc('month', timezone('Africa/Nairobi', p_anchor))
      and not exists (
        select 1
        from public.ambassador_revenue_commissions x
        where x.ambassador_id = ref.referrer_id
          and x.farmer_company_id = ref.referred_user_id
          and x.type = 'monthly'
          and x.billing_month = v_month_start
      )
  loop
    insert into public.ambassador_revenue_commissions (
      ambassador_id,
      farmer_company_id,
      referral_id,
      type,
      amount,
      status,
      release_date,
      approved_for_payout,
      billing_month
    )
    values (
      r.ambassador_id,
      r.company_id,
      r.referral_id,
      'monthly',
      500,
      'locked',
      now() + make_interval(days => greatest(1, least(
        14,
        coalesce((select a2.commission_release_delay_days from public.ambassadors a2 where a2.id = r.ambassador_id), 7)
      ))),
      true,
      v_month_start
    );
    v_inserted := v_inserted + 1;
  end loop;

  perform public.promote_ambassador_commission_releases();

  return jsonb_build_object('ok', true, 'inserted', v_inserted, 'billing_month', v_month_start);
end;
$$;

revoke all on function public.process_ambassador_monthly_commissions(timestamptz) from public;
grant execute on function public.process_ambassador_monthly_commissions(timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- 8) Company signup: no commission until verified payment (legacy 200 path removed)
-- ---------------------------------------------------------------------------
create or replace function public.apply_ambassador_referral_company_signup_bonus(
  p_ambassador_id uuid,
  p_company_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, core
as $$
begin
  -- Intentionally empty: commissions are created only after verified subscription payments.
  return;
end;
$$;

revoke all on function public.apply_ambassador_referral_company_signup_bonus(uuid, uuid) from public;
grant execute on function public.apply_ambassador_referral_company_signup_bonus(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9) Award per-payment farmer bonus (KES 600) + unlock ambassador signup row
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
  v_delay int;
  v_release timestamptz;
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

  select greatest(1, least(14, coalesce(a.commission_release_delay_days, 7)))
  into v_delay
  from public.ambassadors a
  where a.id = v_amb;

  v_release := now() + make_interval(days => v_delay);

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
    'locked',
    v_release,
    true,
    v_receipt
  );

  update public.ambassador_revenue_commissions c
  set
    status = 'locked',
    release_date = v_release,
    approved_for_payout = true
  where c.ambassador_id = v_amb
    and c.type = 'signup'
    and c.status = 'pending';

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
    'signup_unlocked', v_signup_unlocked > 0
  );
end;
$$;

comment on function public.award_subscription_commission(uuid, text) is
  'KES 600 per verified subscription payment (idempotent on company_id + receipt). Unlocks ambassador signup commission from pending to locked. Monthly KES 500 is generated by process_ambassador_monthly_commissions.';

revoke all on function public.award_subscription_commission(uuid, text) from public;
grant execute on function public.award_subscription_commission(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 10) Onboarding: ambassador signup row (600 pending until first farmer payment)
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
    'signup',
    600,
    'pending',
    null,
    false
  )
  on conflict (ambassador_id) where (type = 'signup') do nothing;
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
    'signup',
    600,
    'pending',
    null,
    false
  )
  on conflict (ambassador_id) where (type = 'signup') do nothing;

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 11) Dashboard stats (balances + active paying farmers + monthly run-rate)
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

  perform public.refresh_ambassador_balance_cache(p_ambassador_id);

  select coalesce(a.total_earnings, 0), coalesce(a.pending_balance, 0), coalesce(a.available_balance, 0)
  into v_total_earned, v_pending, v_available
  from public.ambassadors a
  where a.id = p_ambassador_id;

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
-- 12) Referral rows: commission from ledger (+ legacy earnings)
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
                  and c.status in ('locked', 'available')
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
-- 13) Earnings / transactions list (ledger + non-subscription legacy)
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
              when 'signup' then 'Ambassador signup bonus'
              when 'farmer_bonus' then 'Farmer payment bonus'
              when 'monthly' then 'Monthly recurring commission'
              else coalesce(c.type, '')
            end,
            'type', c.type,
            'amount', c.amount,
            'status', case c.status
              when 'pending' then 'pending'
              when 'locked' then 'held'
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
-- 14) Withdrawals (ambassador request + developer review)
-- ---------------------------------------------------------------------------
create or replace function public.ambassador_request_withdrawal(p_amount numeric)
returns jsonb
language plpgsql
security definer
set search_path = public, core
as $$
declare
  v_clerk text;
  v_id uuid;
  v_amt numeric;
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

  v_amt := round(coalesce(p_amount, 0), 2);
  if v_amt < 2000 then
    return jsonb_build_object('ok', false, 'error', 'below_minimum');
  end if;

  perform public.refresh_ambassador_balance_cache(v_id);

  if (select coalesce(a.available_balance, 0) from public.ambassadors a where a.id = v_id) < v_amt then
    return jsonb_build_object('ok', false, 'error', 'insufficient_available');
  end if;

  insert into public.ambassador_withdrawals (ambassador_id, amount, status)
  values (v_id, v_amt, 'pending');

  perform public.refresh_ambassador_balance_cache(v_id);

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.ambassador_request_withdrawal(numeric) from public;
grant execute on function public.ambassador_request_withdrawal(numeric) to authenticated;

create or replace function public.fetch_my_ambassador_withdrawals()
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

  return jsonb_build_object(
    'ok', true,
    'rows', coalesce((
      select jsonb_agg(x.obj order by x.sort_at desc)
      from (
        select
          w.created_at as sort_at,
          jsonb_build_object(
            'id', w.id,
            'created_at', w.created_at,
            'amount', w.amount,
            'status', w.status,
            'notes', w.notes
          ) as obj
        from public.ambassador_withdrawals w
        where w.ambassador_id = v_id
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.fetch_my_ambassador_withdrawals() from public;
grant execute on function public.fetch_my_ambassador_withdrawals() to authenticated;

create or replace function public.dev_review_ambassador_withdrawal(
  p_withdrawal_id uuid,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text := lower(trim(coalesce(p_action, '')));
  v_amb uuid;
  n int := 0;
begin
  if not public.is_developer() then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  if p_withdrawal_id is null or v_action not in ('approve', 'reject', 'mark_paid') then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  select w.ambassador_id into v_amb
  from public.ambassador_withdrawals w
  where w.id = p_withdrawal_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_action = 'approve' then
    update public.ambassador_withdrawals w
    set status = 'approved', decided_at = now()
    where w.id = p_withdrawal_id and w.status = 'pending';
    get diagnostics n = row_count;
  elsif v_action = 'reject' then
    update public.ambassador_withdrawals w
    set status = 'rejected', decided_at = now()
    where w.id = p_withdrawal_id and w.status in ('pending', 'approved');
    get diagnostics n = row_count;
  elsif v_action = 'mark_paid' then
    update public.ambassador_withdrawals w
    set status = 'paid', decided_at = coalesce(decided_at, now())
    where w.id = p_withdrawal_id and w.status in ('pending', 'approved');
    get diagnostics n = row_count;
  end if;

  perform public.refresh_ambassador_balance_cache(v_amb);

  return jsonb_build_object('ok', true, 'updated', n);
end;
$$;

revoke all on function public.dev_review_ambassador_withdrawal(uuid, text) from public;
grant execute on function public.dev_review_ambassador_withdrawal(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 15) Backfill ledger from legacy subscription transactions + signup rows
-- ---------------------------------------------------------------------------
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
select
  t.ambassador_id,
  t.company_id,
  t.referral_id,
  'farmer_bonus'::text,
  t.amount,
  case when e.status = 'paid' then 'paid'::text else 'locked'::text end,
  case when e.status = 'paid' then now() else now() end,
  true,
  t.receipt_number
from public.ambassador_transactions t
left join public.ambassador_earnings e
  on e.commission_tx_id = t.id
where t.type = 'subscription_commission'
  and not exists (
    select 1
    from public.ambassador_revenue_commissions x
    where x.type = 'farmer_bonus'
      and x.farmer_company_id = t.company_id
      and x.idempotency_key = t.receipt_number
  );

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
  'signup'::text,
  600::numeric,
  'pending'::text,
  null,
  false
from public.ambassadors a
where not exists (
  select 1 from public.ambassador_revenue_commissions c
  where c.ambassador_id = a.id and c.type = 'signup'
);

update public.referrals r
set
  first_revenue_at = coalesce(
    r.first_revenue_at,
    (
      select min(t.created_at)
      from public.ambassador_transactions t
      where t.company_id = r.referred_user_id
        and t.type = 'subscription_commission'
    )
  ),
  last_verified_payment_at = coalesce(
    r.last_verified_payment_at,
    (
      select max(t.created_at)
      from public.ambassador_transactions t
      where t.company_id = r.referred_user_id
        and t.type = 'subscription_commission'
    )
  )
where r.referred_user_type = 'company';

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

notify pgrst, 'reload schema';

commit;
