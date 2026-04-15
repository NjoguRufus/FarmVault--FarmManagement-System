-- Ambassador transaction list: show ledger "locked" rows as status "pending" in JSON (not "held").

begin;

create or replace function public.fetch_ambassador_earnings_transactions(p_ambassador_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if p_ambassador_id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  if not exists (select 1 from public.ambassadors a where a.id = p_ambassador_id) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  return jsonb_build_object(
    'ok', true,
    'rows', coalesce((
      select jsonb_agg(row_obj order by sort_at desc)
      from (
        select
          c.created_at as sort_at,
          jsonb_build_object(
            'id', c.id,
            'created_at', c.created_at,
            'description', case c.type
              when 'welcome_bonus' then 'Welcome bonus (KES 300)'
              when 'farmer_bonus' then 'Farmer payment bonus'
              when 'monthly' then 'Monthly recurring commission'
              else coalesce(c.type, '')
            end,
            'type', c.type,
            'amount', c.amount,
            'status', case c.status
              when 'pending' then 'pending'
              when 'locked' then 'pending'
              when 'available' then 'available'
              when 'paid' then 'paid'
              else c.status
            end,
            'release_date', c.release_date
          ) as row_obj
        from public.ambassador_revenue_commissions c
        where c.ambassador_id = p_ambassador_id
        union all
        select
          e.created_at as sort_at,
          jsonb_build_object(
            'id', e.id,
            'created_at', e.created_at,
            'description', coalesce(e.description, ''),
            'type', e.type,
            'amount', e.amount,
            'status', e.status,
            'release_date', null
          ) as row_obj
        from public.ambassador_earnings e
        where e.ambassador_id = p_ambassador_id
          and e.type not in ('subscription_commission', 'farmer_subscription_commission')
      ) sub
    ), '[]'::jsonb)
  );
end;
$$;

commit;

notify pgrst, 'reload schema';
