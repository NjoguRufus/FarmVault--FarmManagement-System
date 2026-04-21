-- Deterministic, self-healing company subscription resolver (billing-safe).
--
-- Guarantees:
-- - Exactly ONE subscription row per company (enforced by PK/UNIQUE + auto-create trigger)
-- - Resolver RPC NEVER returns null and self-heals missing rows
-- - Frontend must treat "unknown" as unknown until resolved (no basic fallback)

begin;

-- ---------------------------------------------------------------------------
-- 1) Data integrity: ensure one row per company_id
-- ---------------------------------------------------------------------------
do $$
begin
  -- If the table exists, ensure company_id is UNIQUE even if legacy migrations created it differently.
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'company_subscriptions'
  ) then
    begin
      alter table public.company_subscriptions
        add constraint company_subscriptions_company_id_unique unique (company_id);
    exception when duplicate_object then
      -- already exists
      null;
    end;
  end if;
end $$;

-- Backfill: ensure every existing company has a subscription row.
insert into public.company_subscriptions (
  company_id,
  plan_id,
  plan_code,
  plan,
  status,
  billing_mode,
  updated_at
)
select
  c.id,
  'basic',
  'basic',
  'basic',
  'pending_approval',
  'manual',
  now()
from core.companies c
where not exists (
  select 1
  from public.company_subscriptions s
  where s.company_id = c.id
);

-- ---------------------------------------------------------------------------
-- 2) Auto-create subscription row on company creation (trigger)
-- ---------------------------------------------------------------------------
create or replace function core.ensure_company_subscription_row()
returns trigger
language plpgsql
security definer
set search_path = core, public
as $$
begin
  -- Always ensure the row exists; never overwrite an existing row.
  insert into public.company_subscriptions (
    company_id,
    plan_id,
    plan_code,
    plan,
    status,
    billing_mode,
    updated_at
  )
  values (
    new.id,
    'basic',
    'basic',
    'basic',
    'pending_approval',
    'manual',
    now()
  )
  on conflict (company_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_ensure_company_subscription_row on core.companies;
create trigger trg_ensure_company_subscription_row
  after insert on core.companies
  for each row
  execute procedure core.ensure_company_subscription_row();

-- ---------------------------------------------------------------------------
-- 3) Authoritative resolver RPC: public.get_company_subscription(company_id)
-- ---------------------------------------------------------------------------
drop type if exists public.company_subscription_resolved cascade;
create type public.company_subscription_resolved as (
  plan        text,
  status      text,
  valid_until timestamptz,
  resolved_at timestamptz,
  is_trial    boolean
);

create or replace function public.get_company_subscription(p_company_id uuid)
returns public.company_subscription_resolved
language plpgsql
stable
security definer
set search_path = admin, core, public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_row public.company_subscription_resolved;
  v_grace interval := interval '7 days';
begin
  if p_company_id is null then
    raise exception 'company_id required' using errcode = 'P0001';
  end if;

  -- Self-heal: ensure subscription row exists.
  insert into public.company_subscriptions (
    company_id,
    plan_id,
    plan_code,
    plan,
    status,
    billing_mode,
    updated_at
  )
  values (
    p_company_id,
    'basic',
    'basic',
    'basic',
    'pending_approval',
    'manual',
    v_now
  )
  on conflict (company_id) do nothing;

  /*
    Deterministic resolution rules (billing-safe):
    - Paid signals (subscription_payments approved OR mpesa_payments result_code=0) win immediately.
    - Developer override wins over all.
    - When no paid signal exists, use the subscription row snapshot.
    - Never return null: Basic gets valid_until=infinity.
  */
  with c as (
    select id, active_until
    from core.companies
    where id = p_company_id
  ),
  s as (
    select *
    from public.company_subscriptions
    where company_id = p_company_id
    limit 1
  ),
  override_active as (
    select exists (
      select 1
      from admin.subscription_overrides o
      where o.company_id = p_company_id
        and (o.expires_at is null or o.expires_at > v_now)
    ) as is_active
  ),
  pay as (
    select
      (
        exists (
          select 1
          from public.subscription_payments sp
          where lower(btrim(sp.company_id)) = lower(btrim(p_company_id::text))
            and sp.status = 'approved'::public.subscription_payment_status
        )
        or
        exists (
          select 1
          from public.mpesa_payments mp
          where mp.company_id = p_company_id
            and mp.result_code = 0
        )
      ) as has_paid,
      coalesce(
        (
          select sp.plan_id::text
          from public.subscription_payments sp
          where lower(btrim(sp.company_id)) = lower(btrim(p_company_id::text))
            and sp.status = 'approved'::public.subscription_payment_status
          order by sp.approved_at desc nulls last, sp.created_at desc
          limit 1
        ),
        (
          select
            case
              when lower(btrim(coalesce(mp.plan, ''))) like '%pro%' then 'pro'
              when lower(btrim(coalesce(mp.plan, ''))) = 'basic' then 'basic'
              else 'pro'
            end
          from public.mpesa_payments mp
          where mp.company_id = p_company_id
            and mp.result_code = 0
          order by mp.paid_at desc nulls last, mp.created_at desc
          limit 1
        )
      ) as paid_plan
  ),
  resolved as (
    select
      -- Plan: override > paid > snapshot > basic
      case
        when (select is_active from override_active) then 'pro'
        when (select has_paid from pay) then
          case when lower(coalesce((select paid_plan from pay), 'pro')) like '%pro%' then 'pro' else 'basic' end
        else
          case
            when lower(coalesce((select plan_code from s), (select plan_id from s), 'basic')) like '%pro%' then 'pro'
            else 'basic'
          end
      end as plan_norm,

      -- Valid-until: paid uses period end; trial uses trial_ends_at; basic uses infinity
      case
        when (select is_active from override_active) then coalesce((select current_period_end from s), (select active_until from s), (select active_until from c), 'infinity'::timestamptz)
        when (select has_paid from pay) then coalesce((select current_period_end from s), (select active_until from s), (select active_until from c), v_now)
        when coalesce((select is_trial from s), false) and (select trial_ends_at from s) is not null then (select trial_ends_at from s)
        else 'infinity'::timestamptz
      end as valid_until_norm,

      -- Trial marker (for UX only; plan/status remain deterministic)
      (coalesce((select is_trial from s), false) = true and (select trial_ends_at from s) is not null and (select trial_ends_at from s) > v_now) as is_trial_norm
  )
  select
    r.plan_norm,
    case
      when r.plan_norm = 'basic' then 'active'
      when r.valid_until_norm = 'infinity'::timestamptz then 'active'
      when r.valid_until_norm > v_now then 'active'
      when v_now <= r.valid_until_norm + v_grace then 'grace'
      else 'expired'
    end as status_norm,
    r.valid_until_norm,
    v_now as resolved_at,
    r.is_trial_norm
  into v_row
  from resolved r;

  -- Defensive: never return null
  if v_row.plan is null then
    v_row.plan := 'basic';
  end if;
  if v_row.status is null then
    v_row.status := 'active';
  end if;
  if v_row.valid_until is null then
    v_row.valid_until := 'infinity'::timestamptz;
  end if;
  if v_row.resolved_at is null then
    v_row.resolved_at := v_now;
  end if;
  if v_row.is_trial is null then
    v_row.is_trial := false;
  end if;

  return v_row;
end;
$$;

grant execute on function public.get_company_subscription(uuid) to authenticated;

commit;

notify pgrst, 'reload schema';

