-- Extend ambassador payout lifecycle:
-- - request/approve/paid email notifications
-- - developer/global payout listing RPCs
-- - idempotent expense recording when paid
-- - status timeline labels for UI consumption

begin;

alter table developer.farmvault_expenses
  add column if not exists reference_id uuid;

alter table developer.farmvault_expenses
  add column if not exists description text;

create unique index if not exists uq_farmvault_expenses_ambassador_payout_ref
  on developer.farmvault_expenses (reference_id, category)
  where reference_id is not null and lower(category) = 'ambassador payout';

create or replace function public.ambassador_payout_status_timeline_label(p_status text)
returns text
language sql
immutable
as $$
  select case lower(trim(coalesce(p_status, '')))
    when 'pending' then 'requested'
    when 'approved' then 'waiting payment'
    when 'paid' then 'completed'
    else lower(trim(coalesce(p_status, '')))
  end
$$;

create or replace function public.ambassador_payout_notify_enqueue(
  p_withdrawal_id uuid,
  p_event text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_url text;
  v_secret text;
  v_event text := lower(trim(coalesce(p_event, '')));
begin
  if p_withdrawal_id is null or v_event not in ('payout_requested', 'payout_approved', 'payout_paid') then
    return;
  end if;

  begin
    select decrypted_secret into v_project_url
    from vault.decrypted_secrets
    where name = 'farmvault_project_url'
    limit 1;

    select decrypted_secret into v_secret
    from vault.decrypted_secrets
    where name = 'ambassador_payout_notify_secret'
    limit 1;
  exception
    when undefined_table then
      return;
  end;

  if coalesce(v_project_url, '') = '' or coalesce(v_secret, '') = '' then
    return;
  end if;

  perform net.http_post(
    url := trim(trailing '/' from v_project_url) || '/functions/v1/notify-ambassador-payout-lifecycle',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body := jsonb_build_object(
      'event', v_event,
      'withdrawal_id', p_withdrawal_id
    )
  );
exception
  when others then
    -- Non-blocking: payout state changes should still succeed if notify queue fails.
    null;
end;
$$;

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
  v_withdrawal_id uuid;
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
  values (v_id, v_amt, 'pending')
  returning id into v_withdrawal_id;

  perform public.refresh_ambassador_balance_cache(v_id);
  perform public.ambassador_payout_notify_enqueue(v_withdrawal_id, 'payout_requested');

  return jsonb_build_object('ok', true);
end;
$$;

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
  n int := 0;
begin
  if not public.is_developer() then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  if p_withdrawal_id is null or v_action not in ('approve', 'reject', 'mark_paid') then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  select w.ambassador_id, coalesce(w.amount, 0) into v_amb, v_amount
  from public.ambassador_withdrawals w
  where w.id = p_withdrawal_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

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

      perform public.ambassador_payout_notify_enqueue(p_withdrawal_id, 'payout_paid');
    end if;
  end if;

  perform public.refresh_ambassador_balance_cache(v_amb);

  return jsonb_build_object('ok', true, 'updated', n);
end;
$$;

create or replace function public.dev_list_ambassador_payouts(
  p_ambassador_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_developer() then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  return jsonb_build_object(
    'ok', true,
    'rows', coalesce((
      select jsonb_agg(row_obj order by sort_at desc)
      from (
        select
          w.created_at as sort_at,
          jsonb_build_object(
            'id', w.id,
            'ambassador_id', a.id,
            'ambassador_name', coalesce(nullif(trim(a.name), ''), 'Ambassador'),
            'created_at', w.created_at,
            'decided_at', w.decided_at,
            'amount', w.amount,
            'status', w.status,
            'status_label', public.ambassador_payout_status_timeline_label(w.status),
            'notes', w.notes
          ) as row_obj
        from public.ambassador_withdrawals w
        join public.ambassadors a on a.id = w.ambassador_id
        where p_ambassador_id is null or w.ambassador_id = p_ambassador_id
      ) q
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.dev_list_ambassador_payouts(uuid) from public;
grant execute on function public.dev_list_ambassador_payouts(uuid) to authenticated;

commit;

notify pgrst, 'reload schema';
