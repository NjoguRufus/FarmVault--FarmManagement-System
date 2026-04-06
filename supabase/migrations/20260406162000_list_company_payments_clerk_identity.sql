-- list_company_payments: use core.current_user_id() (matches RLS + current_company_id)
-- instead of auth.jwt()->>'sub' only, and core.is_company_member() for membership.
-- Fixes tenant Billing "No payments yet" while developer dashboard shows rows.

begin;

-- Postgres cannot change OUT/return row type via CREATE OR REPLACE; drop first if signature differs
-- (e.g. older deploy without ledger_source column).
drop function if exists public.list_company_payments(uuid);

create function public.list_company_payments(
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
  v_caller_id := nullif(trim(coalesce(core.current_user_id(), '')), '');

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

  v_is_member := core.is_company_member(_company_id);

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
