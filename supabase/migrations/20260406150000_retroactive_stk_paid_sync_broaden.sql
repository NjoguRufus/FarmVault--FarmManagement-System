-- FarmVault: retroactive paid state for ALL companies with confirmed M-Pesa STK (public.mpesa_payments).
-- "stk_confirmed" in ops docs = rows where result_code = 0 and/or status SUCCESS|COMPLETED (Daraja variance).
--
-- 1) Insert missing subscription_payments for STK successes (broader than result_code-only).
-- 2) Force core.companies + company_subscriptions to Pro active for every such company (no trial).
-- 3) Mark mpesa_payments.subscription_activated where appropriate.
-- 4) get_subscription_gate_state: treat SUCCESS/COMPLETED like result_code 0.
-- 5) list_company_payments: include STK-only rows not already mirrored in subscription_payments + ledger_source.

begin;

-- ---------------------------------------------------------------------------
-- Shared predicate: STK payment confirmed (same as app "stk confirmed")
-- ---------------------------------------------------------------------------
-- mp.result_code = 0 OR upper(status) in (SUCCESS, COMPLETED)

-- ---------------------------------------------------------------------------
-- 1) subscription_payments backfill (idempotent NOT EXISTS)
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
  case
    when lower(btrim(coalesce(mp.billing_cycle, ''))) in ('monthly', 'seasonal', 'annual')
      then lower(btrim(mp.billing_cycle))
    else 'monthly'
  end,
  'Retroactive STK fix (broaden) — receipt: ' || coalesce(mp.mpesa_receipt, 'N/A'),
  'KES',
  coalesce(mp.paid_at, mp.created_at),
  coalesce(mp.paid_at, mp.created_at),
  coalesce(mp.paid_at, mp.created_at),
  coalesce(mp.paid_at, mp.created_at),
  'mpesa_stk'
from public.mpesa_payments mp
where mp.company_id is not null
  and (
    (mp.result_code is not null and mp.result_code = 0)
    or upper(trim(coalesce(mp.status, ''))) in ('SUCCESS', 'COMPLETED')
  )
  and not exists (
    select 1
    from public.subscription_payments sp
    where lower(btrim(sp.company_id)) = lower(btrim(mp.company_id::text))
      and sp.billing_mode = 'mpesa_stk'
      and (
        (
          nullif(btrim(coalesce(mp.mpesa_receipt, '')), '') is not null
          and sp.transaction_code = nullif(btrim(coalesce(mp.mpesa_receipt, '')), '')
        )
        or
        (
          nullif(btrim(coalesce(mp.mpesa_receipt, '')), '') is not null
          and sp.notes like '%' || coalesce(mp.mpesa_receipt, '') || '%'
        )
        or
        (
          nullif(btrim(coalesce(mp.mpesa_receipt, '')), '') is null
        )
      )
  );

-- ---------------------------------------------------------------------------
-- 2) Force core.companies — ALWAYS sync for latest STK per company (no "only if trial" guard)
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
  where mp.company_id is not null
    and (
      (mp.result_code is not null and mp.result_code = 0)
      or upper(trim(coalesce(mp.status, ''))) in ('SUCCESS', 'COMPLETED')
    )
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
  active_until         = greatest(
                           coalesce(c.active_until, p.period_end),
                           p.period_end
                         ),
  updated_at           = clock_timestamp()
from stk_with_period p
where c.id = p.company_id;

-- ---------------------------------------------------------------------------
-- 3) company_subscriptions — upsert active paid for every STK-confirmed company
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
  where mp.company_id is not null
    and (
      (mp.result_code is not null and mp.result_code = 0)
      or upper(trim(coalesce(mp.status, ''))) in ('SUCCESS', 'COMPLETED')
    )
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
  'retroactive_stk_broaden'
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
  updated_by           = excluded.updated_by;

-- ---------------------------------------------------------------------------
-- 4) mpesa_payments.subscription_activated
-- ---------------------------------------------------------------------------
update public.mpesa_payments
set subscription_activated = true
where company_id is not null
  and (
    (result_code is not null and result_code = 0)
    or upper(trim(coalesce(status, ''))) in ('SUCCESS', 'COMPLETED')
  )
  and coalesce(subscription_activated, false) = false;

-- ---------------------------------------------------------------------------
-- 5) get_subscription_gate_state — STK confirmed = result_code 0 OR SUCCESS|COMPLETED
-- ---------------------------------------------------------------------------
create or replace function public.get_subscription_gate_state()
returns table (
  company_id              uuid,
  company_name            text,
  company_status          text,
  billing_reference       text,
  selected_plan           text,
  billing_mode            text,
  status                  text,
  created_at              timestamptz,
  approved_at             timestamptz,
  approved_by             text,
  rejection_reason        text,
  override_reason         text,
  is_trial                boolean,
  trial_started_at        timestamptz,
  trial_ends_at           timestamptz,
  developer_override_active boolean,
  billing_cycle           text,
  current_period_end      timestamptz,
  active_until            timestamptz
)
language plpgsql
stable
security definer
set search_path = admin, core, public
as $$
declare
  v_company_id uuid;
begin
  v_company_id := core.current_company_id();

  if v_company_id is null then
    return;
  end if;

  return query
  select
    c.id                                                                    as company_id,
    c.name                                                                  as company_name,
    c.status::text                                                          as company_status,
    nullif(btrim(c.billing_reference::text), '')                           as billing_reference,
    coalesce(
      case
        when g.eff_status = 'active' and pay.pay_plan is not null and btrim(pay.pay_plan) <> '' then
          case
            when lower(pay.pay_plan) like '%pro%' then 'pro'::text
            else 'basic'::text
          end
        else null
      end,
      s.plan_id,
      s.plan_code,
      'basic'
    )::text                                                                 as selected_plan,
    coalesce(s.billing_mode, 'manual')::text                               as billing_mode,
    g.eff_status::text                                                      as status,
    c.created_at,
    s.approved_at,
    s.approved_by,
    s.rejection_reason,
    coalesce(s.override_reason, s.override ->> 'reason')                  as override_reason,
    case
      when g.eff_status = 'active' then false
      else coalesce(s.is_trial, false)
    end                                                                     as is_trial,
    case
      when g.eff_status = 'active' then null::timestamptz
      else coalesce(s.trial_started_at, s.trial_starts_at)
    end                                                                     as trial_started_at,
    case
      when g.eff_status = 'active' then null::timestamptz
      else s.trial_ends_at
    end                                                                     as trial_ends_at,
    exists (
      select 1
      from admin.subscription_overrides o
      where o.company_id = c.id
        and (o.expires_at is null or o.expires_at > now())
    )                                                                       as developer_override_active,
    s.billing_cycle,
    coalesce(s.current_period_end, c.active_until)                        as current_period_end,
    coalesce(s.active_until, c.active_until)                               as active_until

  from core.companies c
  left join public.company_subscriptions s on s.company_id::text = c.id::text

  cross join lateral (
    select
      (
        exists (
          select 1
          from public.subscription_payments sp
          where lower(btrim(sp.company_id)) = lower(btrim(c.id::text))
            and sp.status = 'approved'::public.subscription_payment_status
        )
        or
        exists (
          select 1
          from public.mpesa_payments mp
          where mp.company_id = c.id
            and (
              (mp.result_code is not null and mp.result_code = 0)
              or upper(trim(coalesce(mp.status, ''))) in ('SUCCESS', 'COMPLETED')
            )
        )
      )                                                                     as has_approved,
      coalesce(
        (
          select sp.plan_id::text
          from public.subscription_payments sp
          where lower(btrim(sp.company_id)) = lower(btrim(c.id::text))
            and sp.status = 'approved'::public.subscription_payment_status
          order by sp.approved_at desc nulls last, sp.created_at desc
          limit 1
        ),
        (
          select
            case
              when lower(btrim(coalesce(mp.plan, ''))) like '%pro%' then 'pro'
              when lower(btrim(coalesce(mp.plan, ''))) = 'basic'    then 'basic'
              else 'pro'
            end
          from public.mpesa_payments mp
          where mp.company_id = c.id
            and (
              (mp.result_code is not null and mp.result_code = 0)
              or upper(trim(coalesce(mp.status, ''))) in ('SUCCESS', 'COMPLETED')
            )
          order by mp.paid_at desc nulls last, mp.created_at desc
          limit 1
        )
      )                                                                     as pay_plan
  ) pay

  cross join lateral (
    select
      case
        when pay.has_approved
          and (
            s.company_id is null
            or lower(btrim(coalesce(s.status::text, ''))) not in (
              'active',
              'suspended',
              'rejected',
              'expired'
            )
          )
        then 'active'::text
        else coalesce(nullif(btrim(s.status::text), ''), 'pending_approval')
      end                                                                   as eff_status
  ) g

  where c.id = v_company_id;
end;
$$;

grant execute on function public.get_subscription_gate_state() to authenticated;

-- ---------------------------------------------------------------------------
-- 6) list_company_payments — subscription rows + STK-only mirror rows, ledger_source
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
  approved_at      timestamptz,
  ledger_source    text
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
    select *
    from (
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
        sp.approved_at,
        'subscription_payments'::text as ledger_source
      from public.subscription_payments sp
      where sp.company_id = _company_id::text

      union all

      select
        mp.id,
        mp.company_id::text,
        case
          when lower(btrim(coalesce(mp.plan, ''))) like '%pro%' then 'pro'
          when lower(btrim(coalesce(mp.plan, ''))) = 'basic'   then 'basic'
          else 'pro'
        end,
        coalesce(mp.amount, 0),
        'approved'::text,
        'mpesa_stk'::text,
        case
          when lower(btrim(coalesce(mp.billing_cycle, ''))) in ('monthly', 'seasonal', 'annual')
            then lower(btrim(mp.billing_cycle))
          else 'monthly'
        end,
        'KES'::text,
        'mpesa_stk'::text,
        null::text,
        nullif(trim(mp.phone), ''),
        nullif(trim(mp.mpesa_receipt), ''),
        'M-Pesa STK (confirmed)'::text,
        mp.created_at,
        coalesce(mp.paid_at, mp.created_at),
        coalesce(mp.paid_at, mp.created_at),
        'mpesa_stk'::text
      from public.mpesa_payments mp
      where mp.company_id = _company_id
        and (
          (mp.result_code is not null and mp.result_code = 0)
          or upper(trim(coalesce(mp.status, ''))) in ('SUCCESS', 'COMPLETED')
        )
        and not exists (
          select 1
          from public.subscription_payments spx
          where lower(btrim(spx.company_id)) = lower(btrim(mp.company_id::text))
            and spx.billing_mode = 'mpesa_stk'
            and (
              (
                nullif(btrim(coalesce(mp.mpesa_receipt, '')), '') is not null
                and spx.transaction_code = nullif(btrim(coalesce(mp.mpesa_receipt, '')), '')
              )
              or
              (
                nullif(btrim(coalesce(mp.mpesa_receipt, '')), '') is not null
                and spx.notes like '%' || coalesce(mp.mpesa_receipt, '') || '%'
              )
              or
              (
                nullif(btrim(coalesce(mp.mpesa_receipt, '')), '') is null
              )
            )
        )
    ) u
    order by coalesce(u.approved_at, u.submitted_at, u.created_at) desc nulls last;
    return;
  end if;

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
  select *
  from (
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
      sp.approved_at,
      'subscription_payments'::text as ledger_source
    from public.subscription_payments sp
    where sp.company_id = _company_id::text

    union all

    select
      mp.id,
      mp.company_id::text,
      case
        when lower(btrim(coalesce(mp.plan, ''))) like '%pro%' then 'pro'
        when lower(btrim(coalesce(mp.plan, ''))) = 'basic'   then 'basic'
        else 'pro'
      end,
      coalesce(mp.amount, 0),
      'approved'::text,
      'mpesa_stk'::text,
      case
        when lower(btrim(coalesce(mp.billing_cycle, ''))) in ('monthly', 'seasonal', 'annual')
          then lower(btrim(mp.billing_cycle))
        else 'monthly'
      end,
      'KES'::text,
      'mpesa_stk'::text,
      null::text,
      nullif(trim(mp.phone), ''),
      nullif(trim(mp.mpesa_receipt), ''),
      'M-Pesa STK (confirmed)'::text,
      mp.created_at,
      coalesce(mp.paid_at, mp.created_at),
      coalesce(mp.paid_at, mp.created_at),
      'mpesa_stk'::text
    from public.mpesa_payments mp
    where mp.company_id = _company_id
      and (
        (mp.result_code is not null and mp.result_code = 0)
        or upper(trim(coalesce(mp.status, ''))) in ('SUCCESS', 'COMPLETED')
      )
      and not exists (
        select 1
        from public.subscription_payments spx
        where lower(btrim(spx.company_id)) = lower(btrim(mp.company_id::text))
          and spx.billing_mode = 'mpesa_stk'
          and (
            (
              nullif(btrim(coalesce(mp.mpesa_receipt, '')), '') is not null
              and spx.transaction_code = nullif(btrim(coalesce(mp.mpesa_receipt, '')), '')
            )
            or
            (
              nullif(btrim(coalesce(mp.mpesa_receipt, '')), '') is not null
              and spx.notes like '%' || coalesce(mp.mpesa_receipt, '') || '%'
            )
            or
            (
              nullif(btrim(coalesce(mp.mpesa_receipt, '')), '') is null
            )
          )
      )
  ) u
  order by coalesce(u.approved_at, u.submitted_at, u.created_at) desc nulls last;
end;
$$;

revoke all on function public.list_company_payments(uuid) from public;
grant execute on function public.list_company_payments(uuid) to authenticated, service_role;

commit;

notify pgrst, 'reload schema';
