-- Ensure public.company_subscriptions is a table (not a view) so inserts work.
-- Add public.start_trial RPC so onboarding can start a trial without direct insert.

begin;

-- 1) If it was created as a view, drop it so we can have a table.
drop view if exists public.company_subscriptions;

-- 2) Create the table if it doesn't exist.
-- Support both UUID (onboarding schema) and TEXT (legacy) company_id via separate block.
do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'company_subscriptions'
  ) then
    -- Prefer UUID to match public.companies(id) from ensure_onboarding_tables
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'companies' and data_type = 'uuid' and column_name = 'id'
    ) then
      create table public.company_subscriptions (
        company_id uuid primary key references public.companies(id) on delete cascade,
        plan_id text,
        status text,
        current_period_start timestamptz,
        current_period_end timestamptz,
        trial_started_at timestamptz,
        trial_ends_at timestamptz,
        override jsonb,
        updated_at timestamptz not null default now()
      );
    else
      create table public.company_subscriptions (
        company_id text primary key references public.companies(id) on delete cascade,
        plan_id text,
        status text,
        current_period_start timestamptz,
        current_period_end timestamptz,
        trial_started_at timestamptz,
        trial_ends_at timestamptz,
        override jsonb,
        updated_at timestamptz not null default now()
      );
    end if;
  end if;
end $$;

-- Ensure columns exist on existing table (idempotent)
alter table public.company_subscriptions add column if not exists trial_started_at timestamptz;
alter table public.company_subscriptions add column if not exists trial_ends_at timestamptz;

-- 3) RPC: start trial for a company (insert or update row). Call from onboarding instead of direct insert.
create or replace function public.start_trial(
  p_company_id uuid,
  p_plan_id text default 'pro_trial',
  p_trial_ends_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ends_at timestamptz;
begin
  v_ends_at := coalesce(p_trial_ends_at, now() + interval '7 days');

  insert into public.company_subscriptions (
    company_id,
    plan_id,
    status,
    trial_started_at,
    trial_ends_at,
    current_period_end,
    updated_at
  )
  values (
    p_company_id,
    p_plan_id,
    'trialing',
    now(),
    v_ends_at,
    v_ends_at,
    now()
  )
  on conflict (company_id) do update set
    plan_id = excluded.plan_id,
    status = excluded.status,
    trial_started_at = excluded.trial_started_at,
    trial_ends_at = excluded.trial_ends_at,
    current_period_end = excluded.current_period_end,
    updated_at = now();
end;
$$;

grant execute on function public.start_trial(uuid, text, timestamptz) to authenticated;

commit;
