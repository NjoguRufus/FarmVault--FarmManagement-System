-- Retroactive fix for companies that paid via M-Pesa STK but still show trial state.
--
-- Root cause: activate_subscription_from_mpesa_stk was never called (or not run) for some
-- mpesa_payments rows where result_code = 0 (STK confirmed success). Those rows have:
--   - mpesa_payments.result_code = 0   (payment succeeded)
--   - mpesa_payments.subscription_activated = false  (activation RPC never ran)
--   - No matching row in subscription_payments  → gate RPC has_approved = false
--   → get_subscription_gate_state returns status = 'trialing'
--   → Frontend shows "Trial Active" badge
--
-- This migration:
--   1) Creates subscription_payments rows for every successful STK payment that has no row.
--   2) Force-updates core.companies for every STK-confirmed company still in trial.
--   3) Upserts company_subscriptions for same companies.
--   4) Marks mpesa_payments.subscription_activated = true for all processed rows.
--
-- After this migration, the existing get_subscription_gate_state override (from
-- 20260405201000) will see has_approved = true and return status = 'active',
-- resolveWorkspaceSubscriptionState will set isTrial = false, isActivePaid = true,
-- and every affected page (navbar, billing, developer dashboard) will show Pro Active.

begin;

-- ---------------------------------------------------------------------------
-- STEP 1: Normalise plan values helper (inline — no function needed)
-- STK in FarmVault is exclusively for Pro plan upgrades.
-- Default to 'pro' when mpesa_payments.plan is null / unknown.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- STEP 2: Insert subscription_payments rows for STK successes with no row yet.
-- Condition: result_code = 0 AND no existing subscription_payments row for
--   the same company + billing_mode = 'mpesa_stk' matching this receipt.
-- ---------------------------------------------------------------------------
insert into public.subscription_payments (
  company_id,
  plan_id,
  amount,
  status,
  billing_mode,
  payment_method,
  transaction_code,
  billing_cycle,
  notes,
  currency,
  created_at,
  submitted_at,
  approved_at,
  reviewed_at,
  reviewed_by
)
select
  lower(btrim(mp.company_id::text)),
  -- Plan: use stored value if valid, else default to 'pro' (STK = Pro plan in FarmVault)
  case
    when lower(btrim(coalesce(mp.plan, ''))) like '%pro%' then 'pro'
    when lower(btrim(coalesce(mp.plan, ''))) = 'basic'   then 'basic'
    else 'pro'
  end,
  coalesce(mp.amount, 0),
  'approved',
  'mpesa_stk',
  'mpesa_stk',
  nullif(btrim(coalesce(mp.mpesa_receipt, '')), ''),
  -- Billing cycle: use stored value if valid, else monthly
  case
    when lower(btrim(coalesce(mp.billing_cycle, ''))) in ('monthly', 'seasonal', 'annual')
      then lower(btrim(mp.billing_cycle))
    else 'monthly'
  end,
  'Retroactive STK fix — receipt: ' || coalesce(mp.mpesa_receipt, 'N/A'),
  'KES',
  coalesce(mp.paid_at, mp.created_at),
  coalesce(mp.paid_at, mp.created_at),
  coalesce(mp.paid_at, mp.created_at),
  coalesce(mp.paid_at, mp.created_at),
  'mpesa_stk'
from public.mpesa_payments mp
where mp.result_code = 0
  and mp.company_id is not null
  -- Only insert where no matching row exists for this company + billing_mode
  and not exists (
    select 1
    from public.subscription_payments sp
    where lower(btrim(sp.company_id)) = lower(btrim(mp.company_id::text))
      and sp.billing_mode = 'mpesa_stk'
      and (
        -- Match by receipt code if available
        (
          nullif(btrim(coalesce(mp.mpesa_receipt, '')), '') is not null
          and sp.transaction_code = nullif(btrim(coalesce(mp.mpesa_receipt, '')), '')
        )
        or
        -- Or by notes containing receipt
        (
          nullif(btrim(coalesce(mp.mpesa_receipt, '')), '') is not null
          and sp.notes like '%' || coalesce(mp.mpesa_receipt, '') || '%'
        )
        or
        -- Or: no receipt at all — match any mpesa_stk row for this company
        (
          nullif(btrim(coalesce(mp.mpesa_receipt, '')), '') is null
        )
      )
  );

-- ---------------------------------------------------------------------------
-- STEP 3: Force-update core.companies for every STK-confirmed company.
-- Uses the most recent successful STK payment per company as source of truth.
-- Only updates rows that are still in trial / non-active / missing payment_confirmed.
-- ---------------------------------------------------------------------------
with stk_latest as (
  select distinct on (mp.company_id)
    mp.company_id,
    case
      when lower(btrim(coalesce(mp.plan, ''))) like '%pro%' then 'pro'
      when lower(btrim(coalesce(mp.plan, ''))) = 'basic'   then 'basic'
      else 'pro'
    end                                                                     as plan_norm,
    case
      when lower(btrim(coalesce(mp.billing_cycle, ''))) in ('monthly', 'seasonal', 'annual')
        then lower(btrim(mp.billing_cycle))
      else 'monthly'
    end                                                                     as cycle_norm,
    coalesce(mp.paid_at, mp.created_at)                                     as paid_at
  from public.mpesa_payments mp
  where mp.result_code = 0
    and mp.company_id is not null
  order by mp.company_id, mp.paid_at desc nulls last, mp.created_at desc
),
stk_with_period as (
  select
    company_id,
    plan_norm,
    cycle_norm,
    paid_at,
    case
      when cycle_norm = 'seasonal' then paid_at + interval '3 months'
      when cycle_norm = 'annual'   then paid_at + interval '1 year'
      else                              paid_at + interval '1 month'
    end as period_end
  from stk_latest
)
update core.companies c
set
  plan                 = p.plan_norm,
  access_level         = p.plan_norm,
  subscription_status  = 'active',
  payment_confirmed    = true,
  pending_confirmation = false,
  trial_ends_at        = null,
  trial_started_at     = null,
  -- Keep existing active_until if it is already set and in the future;
  -- otherwise use the calculated period end from the STK payment.
  active_until         = greatest(
                           coalesce(c.active_until, p.period_end),
                           p.period_end
                         ),
  updated_at           = clock_timestamp()
from stk_with_period p
where c.id = p.company_id
  and (
    lower(btrim(coalesce(c.subscription_status, ''))) <> 'active'
    or lower(btrim(coalesce(c.access_level, '')))     not in ('pro', 'basic')
    or c.trial_ends_at        is not null
    or coalesce(c.payment_confirmed, false) = false
  );

-- ---------------------------------------------------------------------------
-- STEP 4: Upsert company_subscriptions for every STK-confirmed company.
-- On conflict: only overwrite if the row is still in trial / non-active state.
-- ---------------------------------------------------------------------------
with stk_latest as (
  select distinct on (mp.company_id)
    mp.company_id,
    case
      when lower(btrim(coalesce(mp.plan, ''))) like '%pro%' then 'pro'
      when lower(btrim(coalesce(mp.plan, ''))) = 'basic'   then 'basic'
      else 'pro'
    end                                                                     as plan_norm,
    case
      when lower(btrim(coalesce(mp.billing_cycle, ''))) in ('monthly', 'seasonal', 'annual')
        then lower(btrim(mp.billing_cycle))
      else 'monthly'
    end                                                                     as cycle_norm,
    coalesce(mp.paid_at, mp.created_at)                                     as paid_at
  from public.mpesa_payments mp
  where mp.result_code = 0
    and mp.company_id is not null
  order by mp.company_id, mp.paid_at desc nulls last, mp.created_at desc
),
stk_with_period as (
  select
    company_id,
    plan_norm,
    cycle_norm,
    paid_at,
    case
      when cycle_norm = 'seasonal' then paid_at + interval '3 months'
      when cycle_norm = 'annual'   then paid_at + interval '1 year'
      else                              paid_at + interval '1 month'
    end as period_end
  from stk_latest
)
insert into public.company_subscriptions (
  company_id,
  plan_id,
  plan_code,
  plan,
  status,
  billing_mode,
  billing_cycle,
  is_trial,
  trial_started_at,
  trial_starts_at,
  trial_ends_at,
  current_period_start,
  current_period_end,
  active_until,
  approved_at,
  approved_by,
  updated_at,
  updated_by
)
select
  p.company_id,
  p.plan_norm,
  p.plan_norm,
  p.plan_norm,
  'active',
  'mpesa_stk',
  p.cycle_norm,
  false,
  null,
  null,
  null,
  p.paid_at,
  p.period_end,
  p.period_end,
  p.paid_at,
  'mpesa_stk',
  clock_timestamp(),
  'retroactive_stk_fix'
from stk_with_period p
on conflict (company_id) do update set
  plan_id              = excluded.plan_id,
  plan_code            = excluded.plan_code,
  plan                 = excluded.plan,
  status               = 'active',
  billing_mode         = excluded.billing_mode,
  billing_cycle        = excluded.billing_cycle,
  is_trial             = false,
  trial_started_at     = null,
  trial_starts_at      = null,
  trial_ends_at        = null,
  -- Preserve existing period dates if already paid/active; else set from STK payment.
  current_period_start = coalesce(
                           public.company_subscriptions.current_period_start,
                           excluded.current_period_start
                         ),
  current_period_end   = greatest(
                           coalesce(public.company_subscriptions.current_period_end, excluded.current_period_end),
                           excluded.current_period_end
                         ),
  active_until         = greatest(
                           coalesce(public.company_subscriptions.active_until, excluded.active_until),
                           excluded.active_until
                         ),
  approved_at          = coalesce(public.company_subscriptions.approved_at, excluded.approved_at),
  approved_by          = coalesce(public.company_subscriptions.approved_by, excluded.approved_by),
  updated_at           = excluded.updated_at,
  updated_by           = excluded.updated_by
where (
  -- Only overwrite if the existing row is still in a non-paid state
  lower(btrim(coalesce(public.company_subscriptions.status::text, ''))) <> 'active'
  or coalesce(public.company_subscriptions.is_trial, false) = true
  or public.company_subscriptions.trial_ends_at is not null
);

-- ---------------------------------------------------------------------------
-- STEP 5: Mark all successful STK payments as subscription_activated = true.
-- Prevents re-processing and double-rows on future runs.
-- ---------------------------------------------------------------------------
update public.mpesa_payments
set subscription_activated = true
where result_code = 0
  and company_id is not null
  and coalesce(subscription_activated, false) = false;

commit;

notify pgrst, 'reload schema';
