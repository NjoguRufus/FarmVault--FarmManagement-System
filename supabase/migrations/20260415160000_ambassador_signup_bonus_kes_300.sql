-- Ambassador ledger signup (welcome) bonus: KES 300, pending until first referred farmer payment.

begin;

update public.ambassador_revenue_commissions c
set amount = 300
where c.type = 'signup'
  and c.amount = 600;

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
    300,
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
    300,
    'pending',
    null,
    false
  )
  on conflict (ambassador_id) where (type = 'signup') do nothing;

  return jsonb_build_object('ok', true);
end;
$$;

do $bf$
declare
  r record;
begin
  for r in select distinct ambassador_id from public.ambassador_revenue_commissions where type = 'signup'
  loop
    perform public.refresh_ambassador_balance_cache(r.ambassador_id);
  end loop;
end;
$bf$;

commit;

notify pgrst, 'reload schema';
