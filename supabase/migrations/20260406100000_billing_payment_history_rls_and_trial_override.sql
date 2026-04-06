-- Billing master fix (2026-04-06)
--
-- 1) subscription_payments SELECT policy: force-drop any legacy variant and
--    recreate using public.current_company_id() (core-schema-aware).
--    Fixes company users who see empty payment history on BillingPage.
--
-- 2) activate_company_subscription: ensure trial_started_at is cleared
--    alongside trial_ends_at so no stale trial snapshot survives paid activation.
--
-- 3) Backfill: companies with approved payments but still showing trial snapshot.

begin;

-- ---------------------------------------------------------------------------
-- 1) subscription_payments SELECT policy
-- ---------------------------------------------------------------------------
drop policy if exists subscription_payments_select       on public.subscription_payments;
drop policy if exists subscription_payments_select_v2    on public.subscription_payments;
drop policy if exists sp_select_company_or_developer     on public.subscription_payments;

create policy subscription_payments_select on public.subscription_payments
  for select
  using (
    public.is_developer()
    or (
      public.current_company_id() is not null
      and company_id = public.current_company_id()::text
    )
  );

-- ---------------------------------------------------------------------------
-- 2) Ensure list_company_payments RPC exists with correct membership check
-- ---------------------------------------------------------------------------
create or replace function public.list_company_payments(
  _company_id uuid
)
returns table (
  id               uuid,
  company_id       text,
  plan_id          text,
  amount           numeric,
  status           text,
  billing_mode     text,
  billing_cycle    text,
  currency         text,
  payment_method   text,
  mpesa_name       text,
  mpesa_phone      text,
  transaction_code text,
  notes            text,
  created_at       timestamptz,
  submitted_at     timestamptz,
  approved_at      timestamptz
)
language plpgsql
stable
security definer
set search_path = public, core, admin
as $$
declare
  v_caller_id text;
  v_is_member boolean := false;
begin
  v_caller_id := nullif(trim(coalesce(auth.jwt() ->> 'sub', '')), '');

  if v_caller_id is null then
    return;
  end if;

  if admin.is_developer() then
    return query
      select
        sp.id,
        sp.company_id,
        sp.plan_id,
        sp.amount,
        sp.status::text,
        sp.billing_mode,
        sp.billing_cycle,
        sp.currency,
        sp.payment_method,
        sp.mpesa_name,
        sp.mpesa_phone,
        sp.transaction_code,
        sp.notes,
        sp.created_at,
        sp.submitted_at,
        sp.approved_at
      from public.subscription_payments sp
      where sp.company_id = _company_id::text
      order by sp.created_at desc;
    return;
  end if;

  -- Tenant: verify caller is a member of this company
  select exists (
    select 1
    from core.company_members m
    where m.company_id = _company_id
      and m.clerk_user_id = v_caller_id
  ) into v_is_member;

  if not v_is_member then
    select exists (
      select 1
      from core.profiles p
      where p.clerk_user_id = v_caller_id
        and p.active_company_id = _company_id
    ) into v_is_member;
  end if;

  if not v_is_member then
    return;
  end if;

  return query
    select
      sp.id,
      sp.company_id,
      sp.plan_id,
      sp.amount,
      sp.status::text,
      sp.billing_mode,
      sp.billing_cycle,
      sp.currency,
      sp.payment_method,
      sp.mpesa_name,
      sp.mpesa_phone,
      sp.transaction_code,
      sp.notes,
      sp.created_at,
      sp.submitted_at,
      sp.approved_at
    from public.subscription_payments sp
    where sp.company_id = _company_id::text
    order by sp.created_at desc;
end;
$$;

revoke all on function public.list_company_payments(uuid) from public;
grant execute on function public.list_company_payments(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) Backfill: any company with an approved payment that still shows trial
-- ---------------------------------------------------------------------------
with latest as (
  select distinct on (lower(btrim(sp.company_id)))
    lower(btrim(sp.company_id))                                              as cid,
    case when lower(btrim(coalesce(sp.plan_id, ''))) like '%pro%'
         then 'pro'::text else 'basic'::text end                             as plan_norm,
    lower(btrim(coalesce(nullif(btrim(sp.billing_cycle::text), ''), 'monthly'))) as cycle_norm
  from public.subscription_payments sp
  where sp.status = 'approved'::public.subscription_payment_status
    and sp.company_id is not null
    and btrim(sp.company_id) <> ''
  order by lower(btrim(sp.company_id)), sp.approved_at desc nulls last, sp.created_at desc
),
norm as (
  select
    cid,
    plan_norm,
    case
      when cycle_norm = 'seasonal' then clock_timestamp() + interval '3 months'
      when cycle_norm = 'annual'   then clock_timestamp() + interval '1 year'
      else                              clock_timestamp() + interval '1 month'
    end as period_end,
    cycle_norm
  from latest
)
update core.companies c
set
  subscription_status  = 'active',
  access_level         = n.plan_norm,
  plan                 = n.plan_norm,
  trial_ends_at        = null,
  trial_started_at     = null,
  payment_confirmed    = true,
  pending_confirmation = false,
  active_until         = coalesce(c.active_until, n.period_end),
  updated_at           = clock_timestamp()
from norm n
where lower(btrim(c.id::text)) = n.cid
  and (
    lower(btrim(coalesce(c.subscription_status, ''))) in (
      'trialing', 'trial', 'pending_approval', 'pending_payment', 'pending'
    )
    or c.trial_ends_at is not null
  );

with latest as (
  select distinct on (lower(btrim(sp.company_id)))
    lower(btrim(sp.company_id))                                              as cid,
    case when lower(btrim(coalesce(sp.plan_id, ''))) like '%pro%'
         then 'pro'::text else 'basic'::text end                             as plan_norm,
    lower(btrim(coalesce(nullif(btrim(sp.billing_cycle::text), ''), 'monthly'))) as cycle_norm
  from public.subscription_payments sp
  where sp.status = 'approved'::public.subscription_payment_status
    and sp.company_id is not null
    and btrim(sp.company_id) <> ''
  order by lower(btrim(sp.company_id)), sp.approved_at desc nulls last, sp.created_at desc
),
norm as (
  select
    cid,
    plan_norm,
    case
      when cycle_norm = 'seasonal' then clock_timestamp() + interval '3 months'
      when cycle_norm = 'annual'   then clock_timestamp() + interval '1 year'
      else                              clock_timestamp() + interval '1 month'
    end as period_end,
    cycle_norm
  from latest
)
update public.company_subscriptions s
set
  plan_id              = n.plan_norm,
  plan_code            = n.plan_norm,
  plan                 = n.plan_norm,
  status               = 'active',
  billing_cycle        = case
    when n.cycle_norm in ('seasonal', 'annual', 'monthly') then n.cycle_norm
    else s.billing_cycle
  end,
  is_trial             = false,
  trial_started_at     = null,
  trial_starts_at      = null,
  trial_ends_at        = null,
  current_period_start = coalesce(s.current_period_start, clock_timestamp()),
  current_period_end   = coalesce(s.current_period_end, n.period_end),
  active_until         = coalesce(s.active_until, n.period_end),
  updated_at           = clock_timestamp()
from norm n
where lower(btrim(s.company_id::text)) = n.cid
  and lower(btrim(coalesce(s.status::text, ''))) in (
    'trial', 'trialing', 'pending_approval', 'pending_payment', 'pending'
  );

commit;

notify pgrst, 'reload schema';
