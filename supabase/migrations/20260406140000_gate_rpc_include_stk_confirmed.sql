-- Extend get_subscription_gate_state to treat mpesa_payments.result_code = 0 as
-- an approved payment (belt-and-suspenders alongside subscription_payments).
--
-- Before this migration: gate only checked subscription_payments.status = 'approved'.
-- A company with result_code = 0 in mpesa_payments but no subscription_payments row
-- (activation edge function hasn't run yet) would still see status = 'trialing'.
--
-- After: has_approved = true when EITHER:
--   a) subscription_payments has an approved row for the company, OR
--   b) mpesa_payments has a result_code = 0 row for the company
-- Either source returns status = 'active' from the gate immediately.

begin;

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
    -- selected_plan: prefer plan from approved payment, else subscription row
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
    -- is_trial: force false when effective status is active (paid)
    case
      when g.eff_status = 'active' then false
      else coalesce(s.is_trial, false)
    end                                                                     as is_trial,
    -- trial_started_at: suppress when paid
    case
      when g.eff_status = 'active' then null::timestamptz
      else coalesce(s.trial_started_at, s.trial_starts_at)
    end                                                                     as trial_started_at,
    -- trial_ends_at: suppress when paid
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

  -- Payment check: approved subscription_payment OR successful STK push
  cross join lateral (
    select
      (
        -- Source A: manual-approved or STK-auto subscription_payments row
        exists (
          select 1
          from public.subscription_payments sp
          where lower(btrim(sp.company_id)) = lower(btrim(c.id::text))
            and sp.status = 'approved'::public.subscription_payment_status
        )
        or
        -- Source B: M-Pesa STK callback confirmed (result_code = 0)
        -- Belt-and-suspenders when activate_subscription_from_mpesa_stk hasn't run yet
        exists (
          select 1
          from public.mpesa_payments mp
          where mp.company_id = c.id
            and mp.result_code = 0
        )
      )                                                                     as has_approved,
      coalesce(
        -- Prefer latest plan from subscription_payments
        (
          select sp.plan_id::text
          from public.subscription_payments sp
          where lower(btrim(sp.company_id)) = lower(btrim(c.id::text))
            and sp.status = 'approved'::public.subscription_payment_status
          order by sp.approved_at desc nulls last, sp.created_at desc
          limit 1
        ),
        -- Fall back to plan from mpesa_payments
        (
          select
            case
              when lower(btrim(coalesce(mp.plan, ''))) like '%pro%' then 'pro'
              when lower(btrim(coalesce(mp.plan, ''))) = 'basic'    then 'basic'
              else 'pro'
            end
          from public.mpesa_payments mp
          where mp.company_id = c.id
            and mp.result_code = 0
          order by mp.paid_at desc nulls last, mp.created_at desc
          limit 1
        )
      )                                                                     as pay_plan
  ) pay

  -- Effective status: paid wins over any pre-paid subscription row
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

commit;

notify pgrst, 'reload schema';
