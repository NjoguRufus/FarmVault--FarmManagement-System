-- Canonical pending_confirmation + paid-access setter for Developer Console.

begin;

alter table core.companies
  add column if not exists pending_confirmation boolean not null default false;

-- Developer-only: set paid access window for a company (basic/pro).
create or replace function public.set_company_paid_access(
  _company_id uuid,
  _plan text,
  _months int default 1
)
returns jsonb
language plpgsql
security definer
set search_path = admin, core, public
as $$
declare
  v_plan text := lower(trim(coalesce(_plan, 'basic')));
  v_months int := greatest(1, least(coalesce(_months, 1), 12));
  v_now timestamptz := clock_timestamp();
  v_until timestamptz := v_now + make_interval(months => v_months);
begin
  if not admin.is_developer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if v_plan not in ('basic', 'pro') then
    v_plan := case when v_plan like '%pro%' then 'pro' else 'basic' end;
  end if;

  update core.companies
  set
    plan = v_plan,
    active_until = v_until,
    payment_confirmed = true,
    pending_confirmation = false,
    trial_ends_at = null
  where id = _company_id;

  -- Keep public.company_subscriptions in sync for legacy pages/tools.
  insert into public.company_subscriptions (
    company_id,
    plan_id,
    plan_code,
    plan,
    status,
    billing_mode,
    billing_cycle,
    is_trial,
    trial_started_at,
    trial_starts_at,
    trial_ends_at,
    current_period_start,
    current_period_end,
    active_until,
    approved_at,
    approved_by,
    updated_at,
    updated_by
  )
  values (
    _company_id,
    v_plan,
    v_plan,
    v_plan,
    'active',
    'manual',
    'monthly',
    false,
    null,
    null,
    null,
    v_now,
    v_until,
    v_until,
    v_now,
    core.current_user_id(),
    v_now,
    core.current_user_id()
  )
  on conflict (company_id) do update set
    plan_id = excluded.plan_id,
    plan_code = excluded.plan_code,
    plan = excluded.plan,
    status = 'active',
    billing_mode = 'manual',
    billing_cycle = excluded.billing_cycle,
    is_trial = false,
    trial_started_at = null,
    trial_starts_at = null,
    trial_ends_at = null,
    current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end,
    active_until = excluded.active_until,
    approved_at = excluded.approved_at,
    approved_by = excluded.approved_by,
    updated_at = excluded.updated_at,
    updated_by = excluded.updated_by;

  return jsonb_build_object(
    'success', true,
    'company_id', _company_id::text,
    'plan', v_plan,
    'active_until', v_until,
    'payment_confirmed', true,
    'pending_confirmation', false
  );
end;
$$;

grant execute on function public.set_company_paid_access(uuid, text, int) to authenticated;

commit;

notify pgrst, 'reload schema';

