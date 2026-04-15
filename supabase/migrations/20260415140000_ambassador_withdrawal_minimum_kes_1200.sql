-- Minimum ambassador withdrawal: KES 1,200 (UI + RPC). Blocks new request if one is already pending.

begin;

alter table public.ambassador_withdrawals drop constraint if exists ambassador_withdrawals_amount_check;

alter table public.ambassador_withdrawals
  add constraint ambassador_withdrawals_amount_check check (amount >= 1200);

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
  if v_amt < 1200 then
    return jsonb_build_object('ok', false, 'error', 'below_minimum');
  end if;

  perform public.refresh_ambassador_balance_cache(v_id);

  if (select coalesce(a.available_balance, 0) from public.ambassadors a where a.id = v_id) < v_amt then
    return jsonb_build_object('ok', false, 'error', 'insufficient_available');
  end if;

  if exists (
    select 1
    from public.ambassador_withdrawals w
    where w.ambassador_id = v_id
      and w.status = 'pending'
  ) then
    return jsonb_build_object('ok', false, 'error', 'pending_withdrawal_exists');
  end if;

  insert into public.ambassador_withdrawals (ambassador_id, amount, status)
  values (v_id, v_amt, 'pending');

  perform public.refresh_ambassador_balance_cache(v_id);

  return jsonb_build_object('ok', true);
end;
$$;

commit;

notify pgrst, 'reload schema';
