-- Manual M-Pesa subscription payment submissions: extend subscription_payments,
-- add pending_verification status, secure submit RPC, developer approve/reject + listings.

begin;

-- 1) Enum public.subscription_payment_status (create if missing — some DBs never ran legacy farmvault_schema enum)
do $enum$
begin
  if not exists (
    select 1
    from pg_catalog.pg_type t
    join pg_catalog.pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'subscription_payment_status'
  ) then
    create type public.subscription_payment_status as enum (
      'pending',
      'approved',
      'rejected',
      'pending_verification'
    );
  else
    begin
      alter type public.subscription_payment_status add value if not exists 'pending_verification';
    exception
      when duplicate_object then
        null;
    end;
  end if;
end
$enum$;

-- 1a) Base table — many environments never ran legacy farmvault_schema (no public.subscription_payments).
--     company_id is text (UUID string) to match core.companies + RPC inserts; no FK to legacy public.companies.
create table if not exists public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  plan_id text not null,
  amount numeric(14, 2) not null,
  status public.subscription_payment_status not null default 'pending',
  billing_mode text,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  rejected_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by text,
  currency text not null default 'KES',
  payment_method text not null default 'mpesa_manual',
  mpesa_name text,
  mpesa_phone text,
  transaction_code text,
  billing_cycle text,
  notes text,
  submitted_at timestamptz
);

create index if not exists idx_subscription_payments_company_status
  on public.subscription_payments (company_id, status);
create index if not exists idx_subscription_payments_created_at
  on public.subscription_payments (created_at desc);
create index if not exists idx_subscription_payments_status_created_at
  on public.subscription_payments (status, created_at asc);

alter table public.subscription_payments enable row level security;

do $pol$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'subscription_payments'
      and policyname = 'subscription_payments_select'
  ) then
    create policy subscription_payments_select on public.subscription_payments
      for select
      using (
        admin.is_developer()
        or (
          public.current_company_id() is not null
          and company_id = public.current_company_id()::text
        )
      );
  end if;
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'subscription_payments'
      and policyname = 'subscription_payments_insert'
  ) then
    create policy subscription_payments_insert on public.subscription_payments
      for insert
      with check (
        core.current_user_id() is not null
        and public.current_company_id() is not null
        and company_id = public.current_company_id()::text
      );
  end if;
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'subscription_payments'
      and policyname = 'subscription_payments_update'
  ) then
    create policy subscription_payments_update on public.subscription_payments
      for update
      using (admin.is_developer());
  end if;
end
$pol$;

-- 1b) If status was created as plain text, cast it to the enum (needed for RPC casts below)
do $conv$
begin
  if to_regclass('public.subscription_payments') is null then
    return;
  end if;
  if exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'subscription_payments'
      and c.column_name = 'status'
      and c.data_type in ('text', 'character varying')
  ) then
    execute $sql$
      alter table public.subscription_payments
      alter column status type public.subscription_payment_status
      using (
        case lower(trim(status::text))
          when 'pending' then 'pending'::public.subscription_payment_status
          when 'approved' then 'approved'::public.subscription_payment_status
          when 'rejected' then 'rejected'::public.subscription_payment_status
          when 'pending_verification' then 'pending_verification'::public.subscription_payment_status
          else 'pending'::public.subscription_payment_status
        end
      )
    $sql$;
  end if;
end
$conv$;

-- 2) Columns for M-Pesa manual flow (idempotent)
alter table public.subscription_payments
  add column if not exists currency text not null default 'KES',
  add column if not exists payment_method text not null default 'mpesa_manual',
  add column if not exists mpesa_name text,
  add column if not exists mpesa_phone text,
  add column if not exists transaction_code text,
  add column if not exists billing_cycle text,
  add column if not exists notes text,
  add column if not exists submitted_at timestamptz;

-- Backfill submitted_at from created_at where missing
update public.subscription_payments
set submitted_at = coalesce(submitted_at, created_at)
where submitted_at is null;

-- 3) Expected KES amount (single source aligned with app src/config/plans.ts)
create or replace function public.expected_subscription_amount_kes(_plan_code text, _billing_cycle text)
returns numeric
language sql
immutable
as $$
  select case lower(coalesce(_plan_code, ''))
    when 'basic' then case lower(coalesce(_billing_cycle, ''))
      when 'monthly' then 2500::numeric
      when 'seasonal' then 8500::numeric
      when 'annual' then 24000::numeric
      else null::numeric
    end
    when 'pro' then case lower(coalesce(_billing_cycle, ''))
      when 'monthly' then 5000::numeric
      when 'seasonal' then 15000::numeric
      when 'annual' then 48000::numeric
      else null::numeric
    end
    else null::numeric
  end;
$$;

-- 4) Tenant submit: rate-limit, validate amount, insert payment, set company pending_payment
create or replace function public.submit_manual_subscription_payment(
  _plan_code text,
  _billing_cycle text,
  _amount numeric,
  _mpesa_name text,
  _mpesa_phone text,
  _transaction_code text,
  _currency text default 'KES',
  _notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = admin, core, public
as $$
declare
  v_company_id uuid := core.current_company_id();
  v_user text := core.current_user_id();
  v_plan text := lower(trim(coalesce(_plan_code, '')));
  v_cycle text := lower(trim(coalesce(_billing_cycle, '')));
  v_expected numeric;
  v_tx text;
  v_id uuid;
  v_member boolean := false;
begin
  if v_company_id is null or v_user is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select exists (
    select 1
    from core.company_members cm
    where cm.company_id = v_company_id
      and cm.clerk_user_id = v_user
  ) into v_member;

  if not v_member then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if v_plan not in ('basic', 'pro') then
    raise exception 'invalid plan';
  end if;

  if v_cycle not in ('monthly', 'seasonal', 'annual') then
    raise exception 'invalid billing cycle';
  end if;

  v_expected := public.expected_subscription_amount_kes(v_plan, v_cycle);
  if v_expected is null or _amount is distinct from v_expected then
    raise exception 'amount does not match selected plan and billing cycle';
  end if;

  v_tx := upper(regexp_replace(trim(coalesce(_transaction_code, '')), '[^A-Za-z0-9]', '', 'g'));
  v_tx := left(v_tx, 10);
  if length(trim(coalesce(_mpesa_name, ''))) < 2 then
    raise exception 'M-Pesa name is required';
  end if;
  if length(trim(coalesce(_mpesa_phone, ''))) < 8 then
    raise exception 'phone number is required';
  end if;
  if length(v_tx) < 8 then
    raise exception 'transaction code is required';
  end if;

  if exists (
    select 1
    from public.subscription_payments sp
    where sp.company_id = v_company_id::text
      and sp.status = 'pending_verification'::public.subscription_payment_status
      and sp.created_at > now() - interval '30 minutes'
  ) then
    raise exception 'You already submitted a payment recently. Please wait before submitting again.';
  end if;

  insert into public.subscription_payments (
    company_id,
    plan_id,
    amount,
    status,
    billing_mode,
    billing_cycle,
    currency,
    payment_method,
    mpesa_name,
    mpesa_phone,
    transaction_code,
    notes,
    submitted_at
  )
  values (
    v_company_id::text,
    v_plan,
    _amount,
    'pending_verification'::public.subscription_payment_status,
    v_cycle,
    v_cycle,
    coalesce(nullif(trim(_currency), ''), 'KES'),
    'mpesa_manual',
    trim(_mpesa_name),
    trim(_mpesa_phone),
    v_tx,
    nullif(trim(_notes), ''),
    now()
  )
  returning id into v_id;

  update public.company_subscriptions
  set
    status = 'pending_payment',
    updated_at = now()
  where company_id::text = v_company_id::text;

  return v_id;
end;
$$;

grant execute on function public.submit_manual_subscription_payment(text, text, numeric, text, text, text, text, text) to authenticated;
grant execute on function public.expected_subscription_amount_kes(text, text) to authenticated;

-- 5) Approve / reject: allow pending_verification as well as legacy pending
create or replace function public.approve_subscription_payment(_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = admin, core, public
as $$
begin
  if not admin.is_developer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  update public.subscription_payments
  set
    status = 'approved'::public.subscription_payment_status,
    approved_at = now(),
    reviewed_at = now(),
    reviewed_by = core.current_user_id()
  where id = _payment_id
    and status in (
      'pending'::public.subscription_payment_status,
      'pending_verification'::public.subscription_payment_status
    );
  if not found then
    raise exception 'Payment not found or not pending' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.reject_subscription_payment(_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = admin, core, public
as $$
begin
  if not admin.is_developer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  update public.subscription_payments
  set
    status = 'rejected'::public.subscription_payment_status,
    rejected_at = now(),
    reviewed_at = now(),
    reviewed_by = core.current_user_id()
  where id = _payment_id
    and status in (
      'pending'::public.subscription_payment_status,
      'pending_verification'::public.subscription_payment_status
    );
  if not found then
    raise exception 'Payment not found or not pending' using errcode = 'P0001';
  end if;
end;
$$;

-- 6) Developer listings + KPIs: treat pending_verification like pending
-- Postgres cannot change RETURNS TABLE column set with CREATE OR REPLACE (42P13).
drop function if exists public.dev_dashboard_kpis();
drop function if exists admin.dev_dashboard_kpis();

create or replace function admin.dev_dashboard_kpis()
returns table (
  companies_total           bigint,
  users_total               bigint,
  members_total             bigint,
  subscriptions_total       bigint,
  payments_total            bigint,
  pending_payments_total    bigint,
  public_companies_total    bigint,
  public_profiles_total     bigint,
  public_employees_total    bigint
)
language plpgsql
stable
security definer
set search_path = admin, core, billing, public
as $$
begin
  if not admin.is_developer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select count(*) into companies_total from core.companies;
  select count(*) into users_total     from core.profiles;
  select count(*) into members_total   from core.company_members;

  if exists (select 1 from information_schema.tables where table_schema = 'billing' and table_name = 'company_subscriptions') then
    execute 'select count(*) from billing.company_subscriptions' into subscriptions_total;
  else
    subscriptions_total := 0;
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'billing' and table_name = 'payments') then
    execute 'select count(*) from billing.payments' into payments_total;
  elsif exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'subscription_payments') then
    select count(*) into payments_total from public.subscription_payments;
  else
    payments_total := 0;
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'subscription_payments') then
    select count(*) into pending_payments_total
    from public.subscription_payments
    where status in (
      'pending'::public.subscription_payment_status,
      'pending_verification'::public.subscription_payment_status
    );
  else
    pending_payments_total := 0;
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'companies') then
    execute 'select count(*) from public.companies' into public_companies_total;
  else
    public_companies_total := 0;
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'profiles') then
    execute 'select count(*) from public.profiles' into public_profiles_total;
  else
    public_profiles_total := 0;
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'employees') then
    execute 'select count(*) from public.employees' into public_employees_total;
  else
    public_employees_total := 0;
  end if;

  return next;
end;
$$;

grant execute on function admin.dev_dashboard_kpis() to authenticated;

create or replace function public.dev_dashboard_kpis()
returns table (
  companies_total           bigint,
  users_total               bigint,
  members_total             bigint,
  subscriptions_total       bigint,
  payments_total            bigint,
  pending_payments_total    bigint,
  public_companies_total    bigint,
  public_profiles_total     bigint,
  public_employees_total    bigint
)
language sql
stable
security definer
set search_path = admin, public
as $$
  select * from admin.dev_dashboard_kpis();
$$;

grant execute on function public.dev_dashboard_kpis() to authenticated;

drop function if exists admin.list_pending_payments();
create or replace function admin.list_pending_payments()
returns table (
  id uuid,
  company_id text,
  company_name text,
  plan_id text,
  amount numeric,
  status text,
  billing_mode text,
  billing_cycle text,
  mpesa_name text,
  mpesa_phone text,
  transaction_code text,
  created_at timestamptz
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
    sp.billing_cycle,
    sp.mpesa_name,
    sp.mpesa_phone,
    sp.transaction_code,
    sp.created_at
  from public.subscription_payments sp
  left join core.companies c on c.id::text = sp.company_id
  where sp.status in (
    'pending'::public.subscription_payment_status,
    'pending_verification'::public.subscription_payment_status
  )
  order by sp.created_at desc;
end;
$$;

drop function if exists public.list_pending_payments();
create or replace function public.list_pending_payments()
returns table (
  id uuid,
  company_id text,
  company_name text,
  plan_id text,
  amount numeric,
  status text,
  billing_mode text,
  billing_cycle text,
  mpesa_name text,
  mpesa_phone text,
  transaction_code text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = admin, public
as $$
  select * from admin.list_pending_payments();
$$;

create or replace function public.list_payments(
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
    and (_search is null or _search = '' or c.name ilike '%' || _search || '%' or sp.company_id::text ilike '%' || _search || '%')
  order by sp.created_at desc
  limit _limit
  offset _offset;
end;
$$;

commit;

notify pgrst, 'reload schema';
