-- Excess: (1) Overpayment always from THIS payment's plan/cycle vs billing_prices.
-- (2) Consumption always from CURRENT company_subscriptions (post-activation), so Basic/Pro switches
--     and manual vs STK use the same rules; no early-exit before consuming prior excess.
-- (3) If catalog price missing on a payment, overpayment increment is 0 but prior excess still consumes.

begin;

create or replace function public.apply_excess_for_subscription_payment(_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = admin, core, public
as $$
declare
  v_now              timestamptz := clock_timestamp();
  v_pay_plan         text;
  v_pay_cycle        text;
  v_amount           numeric;
  v_company_id_txt   text;
  v_company_id       uuid;
  v_pay_plan_price   numeric;
  v_excess_add       numeric;
  v_consume_plan     text;
  v_consume_cycle    text;
  v_consume_price    numeric;
  v_int              interval;
  v_bal              numeric;
  v_cau              timestamptz;
  v_has_sub          boolean;
begin
  if coalesce(auth.role()::text, '') is distinct from 'service_role' and not admin.is_developer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select
    sp.company_id,
    sp.plan_id,
    sp.billing_cycle,
    sp.amount
  into v_company_id_txt, v_pay_plan, v_pay_cycle, v_amount
  from public.subscription_payments sp
  where sp.id = _payment_id
    and sp.status = 'approved'::public.subscription_payment_status;

  if v_company_id_txt is null then
    raise exception 'Approved payment not found' using errcode = 'P0001';
  end if;

  begin
    v_company_id := trim(v_company_id_txt)::uuid;
  exception
    when invalid_text_representation then
      raise exception 'Invalid company_id on payment' using errcode = 'P0001';
  end;

  -- --- Overpayment for THIS payment (first payment onward: each row uses its own plan/cycle) ---
  v_pay_plan := lower(trim(coalesce(v_pay_plan, 'basic')));
  if v_pay_plan not in ('basic', 'pro') then
    v_pay_plan := case when v_pay_plan like '%pro%' then 'pro' else 'basic' end;
  end if;

  v_pay_cycle := lower(trim(coalesce(v_pay_cycle, 'monthly')));
  if v_pay_cycle not in ('monthly', 'seasonal', 'annual') then
    v_pay_cycle := 'monthly';
  end if;

  v_pay_plan_price := public.billing_plan_price_kes(v_pay_plan, v_pay_cycle);

  if v_pay_plan_price is null or v_pay_plan_price <= 0 then
    v_excess_add := 0;
  else
    v_excess_add := greatest(0::numeric, coalesce(v_amount, 0) - v_pay_plan_price);
  end if;

  update core.companies c
  set
    excess_balance = coalesce(c.excess_balance, 0) + coalesce(v_excess_add, 0),
    updated_at     = v_now
  where c.id = v_company_id;

  -- --- Consume credit using CURRENT subscription (manual + STK both update this before we run) ---
  select exists (
    select 1
    from public.company_subscriptions cs
    where cs.company_id::text = v_company_id::text
  )
  into v_has_sub;

  if v_has_sub is true then
    select
      lower(trim(coalesce(nullif(trim(cs.plan_code::text), ''), nullif(trim(cs.plan_id::text), ''), 'basic'))),
      lower(trim(coalesce(nullif(trim(cs.billing_cycle::text), ''), 'monthly')))
    into v_consume_plan, v_consume_cycle
    from public.company_subscriptions cs
    where cs.company_id::text = v_company_id::text
    limit 1;
  else
    v_consume_plan := v_pay_plan;
    v_consume_cycle := v_pay_cycle;
  end if;

  if v_consume_plan not in ('basic', 'pro') then
    v_consume_plan := case when v_consume_plan like '%pro%' then 'pro' else 'basic' end;
  end if;

  if v_consume_cycle not in ('monthly', 'seasonal', 'annual') then
    v_consume_cycle := 'monthly';
  end if;

  v_consume_price := public.billing_plan_price_kes(v_consume_plan, v_consume_cycle);

  if v_consume_price is null or v_consume_price <= 0 then
    return;
  end if;

  if v_consume_cycle = 'seasonal' then
    v_int := interval '3 months';
  elsif v_consume_cycle = 'annual' then
    v_int := interval '1 year';
  else
    v_int := interval '1 month';
  end if;

  loop
    select coalesce(c.excess_balance, 0)
    into v_bal
    from core.companies c
    where c.id = v_company_id
    for update;

    exit when v_bal < v_consume_price;

    select c.active_until
    into v_cau
    from core.companies c
    where c.id = v_company_id;

    update core.companies c
    set
      active_until = greatest(coalesce(v_cau, v_now), v_now) + v_int,
      excess_balance = coalesce(c.excess_balance, 0) - v_consume_price,
      updated_at = v_now
    where c.id = v_company_id;

    update public.company_subscriptions s
    set
      current_period_end = c.active_until,
      active_until = c.active_until,
      updated_at = v_now
    from core.companies c
    where s.company_id::text = c.id::text
      and c.id = v_company_id;
  end loop;
end;
$$;

comment on function public.apply_excess_for_subscription_payment(uuid) is
  'Adds overpayment vs billing_prices for this payment plan/cycle; consumes KES credit using current company_subscriptions plan/cycle (manual + STK).';

revoke all on function public.apply_excess_for_subscription_payment(uuid) from public;
grant execute on function public.apply_excess_for_subscription_payment(uuid) to authenticated, service_role;

commit;

notify pgrst, 'reload schema';
