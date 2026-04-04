-- 1) Backfill any missing billing_reference (FV- + md8 from md5(company id); matches existing convention).
-- 2) Fire trigger on UPDATE so cleared references are repopulated.
-- 3) Expose billing_reference on get_subscription_gate_state for billing UI fallbacks.

begin;

update core.companies
set billing_reference = 'FV-' || substr(md5(id::text), 1, 8)
where billing_reference is null
   or btrim(billing_reference) = '';

drop trigger if exists trg_set_billing_reference on core.companies;

create trigger trg_set_billing_reference
  before insert or update on core.companies
  for each row
  execute procedure core.set_billing_reference();

-- ---------------------------------------------------------------------------
-- get_subscription_gate_state — add billing_reference from core.companies
-- ---------------------------------------------------------------------------
drop function if exists public.get_subscription_gate_state();

create or replace function public.get_subscription_gate_state()
returns table (
  company_id uuid,
  company_name text,
  company_status text,
  billing_reference text,
  selected_plan text,
  billing_mode text,
  status text,
  created_at timestamptz,
  approved_at timestamptz,
  approved_by text,
  rejection_reason text,
  override_reason text,
  is_trial boolean,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  developer_override_active boolean,
  billing_cycle text,
  current_period_end timestamptz,
  active_until timestamptz
)
language plpgsql
stable
security definer
set search_path = admin, core, public
as $$
declare
  v_company_id uuid;
begin
  v_company_id := core.current_company_id();

  if v_company_id is null then
    return;
  end if;

  return query
  select
    c.id as company_id,
    c.name as company_name,
    c.status::text as company_status,
    nullif(btrim(c.billing_reference::text), '') as billing_reference,
    coalesce(s.plan_id, s.plan_code, 'basic')::text as selected_plan,
    coalesce(s.billing_mode, 'manual')::text as billing_mode,
    coalesce(s.status, 'pending_approval')::text as status,
    c.created_at,
    s.approved_at,
    s.approved_by,
    s.rejection_reason,
    coalesce(s.override_reason, s.override ->> 'reason') as override_reason,
    case
      when lower(trim(coalesce(s.status, ''))) = 'active' then false
      else coalesce(s.is_trial, false)
    end as is_trial,
    case
      when lower(trim(coalesce(s.status, ''))) = 'active' then null::timestamptz
      else coalesce(s.trial_started_at, s.trial_starts_at)
    end as trial_started_at,
    case
      when lower(trim(coalesce(s.status, ''))) = 'active' then null::timestamptz
      else s.trial_ends_at
    end as trial_ends_at,
    exists (
      select 1
      from admin.subscription_overrides o
      where o.company_id = c.id
        and (o.expires_at is null or o.expires_at > now())
    ) as developer_override_active,
    s.billing_cycle,
    s.current_period_end,
    s.active_until
  from core.companies c
  left join public.company_subscriptions s on s.company_id::text = c.id::text
  where c.id = v_company_id;
end;
$$;

grant execute on function public.get_subscription_gate_state() to authenticated;

commit;

notify pgrst, 'reload schema';
