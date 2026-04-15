begin;

create or replace function public.dev_review_ambassador_withdrawal(
  p_withdrawal_id uuid,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text := lower(trim(coalesce(p_action, '')));
  v_amb uuid;
  v_amount numeric := 0;
  v_ambassador_name text := 'Ambassador';
  n int := 0;
begin
  if not public.is_developer() then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  if p_withdrawal_id is null or v_action not in ('approve', 'reject', 'mark_paid') then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  select w.ambassador_id, coalesce(w.amount, 0)
    into v_amb, v_amount
  from public.ambassador_withdrawals w
  where w.id = p_withdrawal_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select coalesce(nullif(trim(a.name), ''), 'Ambassador')
    into v_ambassador_name
  from public.ambassadors a
  where a.id = v_amb;

  if v_action = 'approve' then
    update public.ambassador_withdrawals w
    set status = 'approved', decided_at = now()
    where w.id = p_withdrawal_id and w.status = 'pending';
    get diagnostics n = row_count;
    if n > 0 then
      perform public.ambassador_payout_notify_enqueue(p_withdrawal_id, 'payout_approved');
    end if;
  elsif v_action = 'reject' then
    update public.ambassador_withdrawals w
    set status = 'rejected', decided_at = now()
    where w.id = p_withdrawal_id and w.status in ('pending', 'approved');
    get diagnostics n = row_count;
  elsif v_action = 'mark_paid' then
    update public.ambassador_withdrawals w
    set status = 'paid', decided_at = coalesce(decided_at, now())
    where w.id = p_withdrawal_id and w.status in ('pending', 'approved');
    get diagnostics n = row_count;

    if n > 0 then
      -- Legacy sink kept for backwards compatibility.
      insert into developer.farmvault_expenses (
        title,
        category,
        amount,
        payment_date,
        status,
        notes,
        description,
        reference_id
      )
      values (
        'Ambassador payout',
        'Ambassador Payout',
        v_amount,
        current_date,
        'paid',
        'Ambassador payout',
        'Ambassador payout',
        p_withdrawal_id
      )
      on conflict (reference_id, category)
      where reference_id is not null and lower(category) = 'ambassador payout'
      do nothing;

      -- Canonical FarmVault internal expenses table.
      insert into public.company_expenses (
        user_id,
        name,
        category,
        amount,
        payment_method,
        date,
        notes,
        source,
        reference_id
      )
      values (
        coalesce(auth.uid(), null),
        format('Ambassador Commission - %s', v_ambassador_name),
        'Staff',
        v_amount,
        'M-Pesa',
        current_date,
        'Auto-created from ambassador payout mark as paid',
        'ambassador_payout',
        p_withdrawal_id
      )
      on conflict (source, reference_id)
      where reference_id is not null
      do update set
        name = excluded.name,
        category = excluded.category,
        amount = excluded.amount,
        payment_method = excluded.payment_method,
        date = excluded.date,
        notes = excluded.notes,
        created_at = now();

      perform public.ambassador_payout_notify_enqueue(p_withdrawal_id, 'payout_paid');
    end if;
  end if;

  perform public.refresh_ambassador_balance_cache(v_amb);

  return jsonb_build_object('ok', true, 'updated', n);
end;
$$;

-- Backfill: ensure all already-paid payouts exist in company_expenses.
insert into public.company_expenses (
  user_id,
  name,
  category,
  amount,
  payment_method,
  date,
  notes,
  source,
  reference_id
)
select
  null,
  format('Ambassador Commission - %s', coalesce(nullif(trim(a.name), ''), 'Ambassador')),
  'Staff',
  coalesce(w.amount, 0),
  'M-Pesa',
  coalesce(w.decided_at::date, w.created_at::date, current_date),
  'Backfilled from paid ambassador payout',
  'ambassador_payout',
  w.id
from public.ambassador_withdrawals w
join public.ambassadors a on a.id = w.ambassador_id
where lower(coalesce(w.status, '')) = 'paid'
on conflict (source, reference_id)
where reference_id is not null
do nothing;

commit;

notify pgrst, 'reload schema';
