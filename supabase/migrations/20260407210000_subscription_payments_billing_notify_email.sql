-- Capture submitter JWT email on manual payment so server-side flows (approve / STK) can reach the same inbox
-- as "awaiting review" when workspace + profile resolution is incomplete.

begin;

alter table public.subscription_payments
  add column if not exists billing_notify_email text null;

comment on column public.subscription_payments.billing_notify_email is
  'Optional: Clerk JWT email at manual submit time; used as last-resort recipient for payment-approved / STK confirmation when company/profile resolution fails.';

create or replace function public.submit_manual_subscription_payment(
  _plan_code text,
  _billing_cycle text,
  _amount numeric,
  _mpesa_name text,
  _mpesa_phone text,
  _transaction_code text,
  _currency text default 'KES',
  _notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = admin, core, public
as $$
declare
  v_company_id uuid := core.current_company_id();
  v_user text := core.current_user_id();
  v_plan text := lower(trim(coalesce(_plan_code, '')));
  v_cycle text := lower(trim(coalesce(_billing_cycle, '')));
  v_expected numeric;
  v_tx text;
  v_id uuid;
  v_member boolean := false;
  v_phone text := nullif(trim(coalesce(_mpesa_phone, '')), '');
  v_notify_email text := nullif(lower(trim(coalesce(auth.jwt() ->> 'email', ''))), '');
begin
  if v_company_id is null or v_user is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select exists (
    select 1
    from core.company_members cm
    where cm.company_id = v_company_id
      and cm.clerk_user_id = v_user
  ) into v_member;

  if not v_member then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if v_plan not in ('basic', 'pro') then
    raise exception 'invalid plan';
  end if;

  if v_cycle not in ('monthly', 'seasonal', 'annual') then
    raise exception 'invalid billing cycle';
  end if;

  v_expected := public.expected_subscription_amount_kes(v_plan, v_cycle);
  if v_expected is null or _amount is distinct from v_expected then
    raise exception 'amount does not match selected plan and billing cycle';
  end if;

  v_tx := upper(regexp_replace(trim(coalesce(_transaction_code, '')), '[^A-Za-z0-9]', '', 'g'));
  v_tx := left(v_tx, 10);
  if length(trim(coalesce(_mpesa_name, ''))) < 2 then
    raise exception 'M-Pesa name is required';
  end if;
  if v_phone is not null and length(v_phone) < 8 then
    raise exception 'phone number is invalid';
  end if;
  if length(v_tx) < 8 then
    raise exception 'transaction code is required';
  end if;

  if exists (
    select 1
    from public.subscription_payments sp
    where sp.company_id = v_company_id::text
      and sp.status = 'pending_verification'::public.subscription_payment_status
      and sp.created_at > now() - interval '30 minutes'
  ) then
    raise exception 'You already submitted a payment recently. Please wait before submitting again.';
  end if;

  insert into public.subscription_payments (
    company_id,
    plan_id,
    amount,
    status,
    billing_mode,
    billing_cycle,
    currency,
    payment_method,
    mpesa_name,
    mpesa_phone,
    transaction_code,
    notes,
    submitted_at,
    billing_notify_email
  )
  values (
    v_company_id::text,
    v_plan,
    _amount,
    'pending_verification'::public.subscription_payment_status,
    v_cycle,
    v_cycle,
    coalesce(nullif(trim(_currency), ''), 'KES'),
    'mpesa_manual',
    trim(_mpesa_name),
    v_phone,
    v_tx,
    nullif(trim(_notes), ''),
    now(),
    case
      when v_notify_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then v_notify_email
      else null
    end
  )
  returning id into v_id;

  update public.company_subscriptions
  set
    status = 'pending_payment',
    updated_at = now()
  where company_id::text = v_company_id::text;

  update core.companies
  set pending_confirmation = true
  where id = v_company_id;

  return v_id;
end;
$$;

commit;

notify pgrst, 'reload schema';
