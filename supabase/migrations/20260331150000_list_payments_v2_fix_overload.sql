-- Fix PostgREST RPC ambiguity caused by overloaded public.list_payments
-- by introducing a non-overloaded function name for the app.

begin;

drop function if exists public.list_payments_v2(text, text, text, timestamptz, timestamptz, text, int, int);
create or replace function public.list_payments_v2(
  _status text default 'pending',
  _billing_mode text default null,
  _plan text default null,
  _date_from timestamptz default null,
  _date_to timestamptz default null,
  _search text default null,
  _limit int default 50,
  _offset int default 0
)
returns table (
  id uuid,
  company_id text,
  company_name text,
  plan_id text,
  amount numeric,
  status text,
  billing_mode text,
  created_at timestamptz,
  approved_at timestamptz,
  reviewed_by text
)
language plpgsql
stable
security definer
set search_path = admin, core, public
as $$
begin
  if not admin.is_developer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return query
  select
    sp.id,
    sp.company_id,
    c.name::text as company_name,
    sp.plan_id,
    sp.amount,
    sp.status::text,
    sp.billing_mode,
    sp.created_at,
    sp.approved_at,
    sp.reviewed_by
  from public.subscription_payments sp
  left join core.companies c on c.id::text = sp.company_id
  where
    (
      _status = 'all'
      or sp.status::text = _status
      or (
        _status = 'pending'
        and sp.status in (
          'pending'::public.subscription_payment_status,
          'pending_verification'::public.subscription_payment_status
        )
      )
    )
    and (_billing_mode is null or sp.billing_mode = _billing_mode)
    and (_plan is null or sp.plan_id = _plan)
    and (_date_from is null or sp.created_at >= _date_from)
    and (_date_to is null or sp.created_at <= _date_to)
    and (
      _search is null
      or _search = ''
      or c.name ilike '%' || _search || '%'
      or sp.company_id::text ilike '%' || _search || '%'
    )
  order by sp.created_at desc
  limit _limit
  offset _offset;
end;
$$;

grant execute on function public.list_payments_v2(text, text, text, timestamptz, timestamptz, text, int, int) to authenticated;

commit;

notify pgrst, 'reload schema';

