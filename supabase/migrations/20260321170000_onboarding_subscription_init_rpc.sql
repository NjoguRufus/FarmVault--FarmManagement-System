begin;

create or replace function public.initialize_company_subscription(
  _company_id uuid,
  _plan_code text default 'basic'
)
returns jsonb
language plpgsql
security definer
set search_path = admin, core, public
as $$
declare
  v_user_id text := core.current_user_id();
  v_plan text := lower(coalesce(nullif(_plan_code, ''), 'basic'));
  v_now timestamptz := now();
  v_allowed boolean := false;
begin
  if _company_id is null then
    raise exception 'company id is required';
  end if;

  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if v_plan not in ('basic', 'pro') then
    v_plan := 'basic';
  end if;

  select exists (
    select 1
    from core.company_members cm
    where cm.company_id::text = _company_id::text
      and cm.clerk_user_id = v_user_id
  ) into v_allowed;

  if not v_allowed then
    raise exception 'not authorized for company %', _company_id using errcode = '42501';
  end if;

  insert into public.company_subscriptions (
    company_id,
    plan_id,
    plan_code,
    status,
    billing_mode,
    approved_at,
    approved_by,
    rejection_reason,
    override_reason,
    updated_at
  )
  values (
    _company_id,
    v_plan,
    v_plan,
    'pending_approval',
    'manual',
    null,
    null,
    null,
    null,
    v_now
  )
  on conflict (company_id) do update set
    plan_id = coalesce(excluded.plan_id, public.company_subscriptions.plan_id),
    plan_code = coalesce(excluded.plan_code, public.company_subscriptions.plan_code),
    status = 'pending_approval',
    billing_mode = 'manual',
    approved_at = null,
    approved_by = null,
    rejection_reason = null,
    override_reason = null,
    updated_at = v_now;

  return jsonb_build_object(
    'success', true,
    'company_id', _company_id::text,
    'status', 'pending_approval',
    'plan_code', v_plan
  );
end;
$$;

grant execute on function public.initialize_company_subscription(uuid, text) to authenticated;

notify pgrst, 'reload schema';

commit;
