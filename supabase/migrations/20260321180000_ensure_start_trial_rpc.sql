-- Ensure public.start_trial exists for onboarding fallback (OnboardingPage.tsx).
-- PostgREST error: "Could not find the function public.start_trial(p_company_id, p_plan_id, p_trial_ends_at)"

begin;

-- Columns expected by newer onboarding; harmless if already present.
alter table if exists public.company_subscriptions
  add column if not exists plan_id text,
  add column if not exists plan_code text,
  add column if not exists plan text,
  add column if not exists status text,
  add column if not exists billing_mode text default 'manual',
  add column if not exists is_trial boolean default false,
  add column if not exists trial_started_at timestamptz,
  add column if not exists trial_starts_at timestamptz,
  add column if not exists trial_ends_at timestamptz,
  add column if not exists current_period_start timestamptz,
  add column if not exists current_period_end timestamptz,
  add column if not exists active_until timestamptz,
  add column if not exists updated_at timestamptz not null default now();

-- Drop all overloads that might conflict with the canonical signature.
drop function if exists public.start_trial(uuid, text, timestamptz);
drop function if exists public.start_trial(uuid, text);
drop function if exists public.start_trial(uuid);

create or replace function public.start_trial(
  p_company_id uuid,
  p_plan_id text default 'pro_trial',
  p_trial_ends_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = core, public
as $$
declare
  v_ends_at timestamptz;
  v_user_id text := core.current_user_id();
  v_plan text;
  v_allowed boolean;
begin
  if p_company_id is null then
    raise exception 'company id is required';
  end if;

  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select exists (
    select 1
    from core.company_members cm
    where cm.company_id::text = p_company_id::text
      and cm.clerk_user_id = v_user_id
  )
  into v_allowed;

  if not v_allowed then
    raise exception 'not authorized for company %', p_company_id using errcode = '42501';
  end if;

  v_ends_at := coalesce(p_trial_ends_at, now() + interval '7 days');

  v_plan := lower(coalesce(nullif(trim(p_plan_id), ''), 'basic'));
  if v_plan not in ('basic', 'pro', 'pro_trial') then
    v_plan := 'basic';
  end if;

  insert into public.company_subscriptions (
    company_id,
    plan_id,
    plan_code,
    plan,
    status,
    billing_mode,
    is_trial,
    trial_started_at,
    trial_starts_at,
    trial_ends_at,
    current_period_end,
    active_until,
    updated_at
  )
  values (
    p_company_id,
    v_plan,
    v_plan,
    v_plan,
    'trialing',
    'manual',
    true,
    now(),
    now(),
    v_ends_at,
    v_ends_at,
    v_ends_at,
    now()
  )
  on conflict (company_id) do update set
    plan_id = excluded.plan_id,
    plan_code = coalesce(excluded.plan_code, public.company_subscriptions.plan_code),
    plan = coalesce(excluded.plan, public.company_subscriptions.plan),
    status = excluded.status,
    billing_mode = coalesce(nullif(public.company_subscriptions.billing_mode, ''), excluded.billing_mode),
    is_trial = true,
    trial_started_at = coalesce(excluded.trial_started_at, public.company_subscriptions.trial_started_at),
    trial_starts_at = coalesce(excluded.trial_starts_at, public.company_subscriptions.trial_starts_at),
    trial_ends_at = excluded.trial_ends_at,
    current_period_end = coalesce(excluded.current_period_end, public.company_subscriptions.current_period_end),
    active_until = coalesce(excluded.active_until, public.company_subscriptions.active_until),
    updated_at = now();
end;
$$;

grant execute on function public.start_trial(uuid, text, timestamptz) to authenticated;

notify pgrst, 'reload schema';

commit;
