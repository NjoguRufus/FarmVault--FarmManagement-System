-- Raise recurring monthly ambassador subscription commission from KES 400 to KES 500
-- (first successful subscription payment remains KES 600).

begin;

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
  v_first boolean;
  v_comm numeric;
  v_tx_id uuid;
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

  select r.id, coalesce(r.first_subscription_paid, false)
  into v_ref, v_first
  from public.referrals r
  where r.referrer_id = v_amb
    and r.referred_user_type = 'company'
    and r.referred_user_id = p_company_id
  order by r.created_at asc
  limit 1;

  if v_ref is null then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'no_referral');
  end if;

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
    case when not v_first then 600 else 500 end,
    'owed',
    'Farmer workspace subscription',
    v_ref
  )
  on conflict (company_id, receipt_number) do nothing
  returning id into v_tx_id;

  if v_tx_id is null then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'duplicate_receipt');
  end if;

  v_comm := case when not v_first then 600 else 500 end;

  insert into public.ambassador_earnings (
    ambassador_id,
    amount,
    type,
    status,
    description,
    referral_id,
    commission_tx_id
  )
  values (
    v_amb,
    v_comm,
    'subscription_commission',
    'owed',
    'Farmer workspace subscription',
    v_ref,
    v_tx_id
  );

  update public.referrals r
  set
    first_subscription_paid = case when not v_first then true else r.first_subscription_paid end,
    referral_status = case
      when r.referral_status = 'commissioned' then r.referral_status
      else 'subscribed'
    end,
    subscribed_at = coalesce(r.subscribed_at, now()),
    last_activity_at = now(),
    is_active = true
  where r.id = v_ref;

  return jsonb_build_object(
    'ok', true,
    'amount', v_comm,
    'first_subscription_payment', not v_first
  );
end;
$$;

comment on function public.award_subscription_commission(uuid, text) is
  'Flat KES ambassador commission for a subscription payment (first payment KES 600, renewals KES 500). Idempotent on (company_id, receipt_number).';

commit;
