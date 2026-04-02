begin;

-- List referrals for an ambassador (for dashboard table). Security definer bypasses RLS.
create or replace function public.fetch_ambassador_referral_rows(p_ambassador_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, core
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
          r.created_at as sort_at,
          jsonb_build_object(
            'referral_id', r.id,
            'name', coalesce(
              nullif(trim(amb.name), ''),
              nullif(trim(comp.name), ''),
              initcap(r.referred_user_type::text)
            ),
            'type', r.referred_user_type,
            'status', case when coalesce(r.is_active, true) then 'active' else 'inactive' end,
            'date', r.created_at,
            'commission', coalesce((
              select sum(c.amount)::numeric
              from public.commissions c
              where c.referrer_id = p_ambassador_id
                and c.user_id is not distinct from r.referred_user_id
            ), 0)
          ) as row_obj
        from public.referrals r
        left join public.ambassadors amb
          on r.referred_user_type = 'ambassador' and amb.id = r.referred_user_id
        left join core.companies comp
          on r.referred_user_type = 'company' and comp.id = r.referred_user_id
        where r.referrer_id = p_ambassador_id
      ) sub
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.fetch_ambassador_referral_rows(uuid) from public;
grant execute on function public.fetch_ambassador_referral_rows(uuid) to anon, authenticated;

create or replace function public.fetch_my_ambassador_referral_rows()
returns jsonb
language plpgsql
security definer
set search_path = public, core
stable
as $$
declare
  v_clerk text;
  v_id uuid;
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

  return public.fetch_ambassador_referral_rows(v_id);
end;
$$;

revoke all on function public.fetch_my_ambassador_referral_rows() from public;
grant execute on function public.fetch_my_ambassador_referral_rows() to authenticated;

commit;
