-- Harvest Workforce Engine
-- Tables: harvest_collections, harvest_pickers, harvest_picker_entries, harvest_picker_totals,
-- harvest_collection_totals, picker_payments, harvest_entry_events + FKs, triggers, helpers.

begin;

create extension if not exists pgcrypto;

-- =========================================================
-- 1) harvest_collections
-- One harvest session / day / shift
-- =========================================================
create table if not exists public.harvest_collections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  project_id uuid not null,
  collection_code text not null,
  collection_date date not null,
  shift_name text,
  collection_status text not null default 'draft',
  pricing_mode text not null default 'per_kg',
  price_per_kg numeric(12,2),
  price_per_crate numeric(12,2),
  currency text not null default 'KES',
  weighing_mode text not null default 'weight_and_crates',
  destination_type text,
  buyer_name text,
  notes text,
  started_by_employee_id uuid,
  started_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint harvest_collections_status_check
    check (collection_status in ('draft', 'active', 'paused', 'closed', 'settled')),

  constraint harvest_collections_pricing_mode_check
    check (pricing_mode in ('per_kg', 'per_crate', 'mixed')),

  constraint harvest_collections_weighing_mode_check
    check (weighing_mode in ('weight_only', 'crates_only', 'weight_and_crates')),

  constraint harvest_collections_company_project_code_uk
    unique (company_id, collection_code)
);

create index if not exists idx_harvest_collections_company
  on public.harvest_collections(company_id);

create index if not exists idx_harvest_collections_project
  on public.harvest_collections(project_id);

create index if not exists idx_harvest_collections_company_date
  on public.harvest_collections(company_id, collection_date desc);

create index if not exists idx_harvest_collections_company_status
  on public.harvest_collections(company_id, collection_status);

-- =========================================================
-- 2) harvest_pickers
-- Picker master data per company
-- =========================================================
create table if not exists public.harvest_pickers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  picker_code text not null,
  full_name text not null,
  phone text,
  national_id text,
  gender text,
  status text not null default 'active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint harvest_pickers_status_check
    check (status in ('active', 'inactive', 'blocked')),

  constraint harvest_pickers_gender_check
    check (gender is null or gender in ('male', 'female', 'other')),

  constraint harvest_pickers_company_code_uk
    unique (company_id, picker_code)
);

create index if not exists idx_harvest_pickers_company
  on public.harvest_pickers(company_id);

create index if not exists idx_harvest_pickers_company_status
  on public.harvest_pickers(company_id, status);

create index if not exists idx_harvest_pickers_company_name
  on public.harvest_pickers(company_id, full_name);

-- =========================================================
-- 3) harvest_picker_entries
-- Append-only high-volume entry table
-- =========================================================
create table if not exists public.harvest_picker_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  collection_id uuid not null,
  picker_id uuid not null,
  entry_number integer,
  weight_kg numeric(12,3) not null default 0,
  crate_count integer not null default 0,
  unit_count integer not null default 0,
  price_snapshot numeric(12,2) not null default 0,
  gross_amount numeric(12,2) not null default 0,
  recorded_by_employee_id uuid,
  recorded_at timestamptz not null default now(),
  device_id text,
  client_entry_id text,
  entry_source text not null default 'manual',
  sync_status text not null default 'synced',
  notes text,
  is_voided boolean not null default false,
  voided_at timestamptz,
  voided_by_employee_id uuid,
  void_reason text,
  created_at timestamptz not null default now(),

  constraint harvest_picker_entries_sync_status_check
    check (sync_status in ('pending', 'synced', 'failed')),

  constraint harvest_picker_entries_source_check
    check (entry_source in ('manual', 'scan', 'offline_sync', 'api')),

  constraint harvest_picker_entries_non_negative_check
    check (
      weight_kg >= 0
      and crate_count >= 0
      and unit_count >= 0
      and gross_amount >= 0
      and price_snapshot >= 0
    )
);

create index if not exists idx_harvest_picker_entries_company_collection_time
  on public.harvest_picker_entries(company_id, collection_id, recorded_at desc);

create index if not exists idx_harvest_picker_entries_company_picker_time
  on public.harvest_picker_entries(company_id, picker_id, recorded_at desc);

create index if not exists idx_harvest_picker_entries_collection_picker
  on public.harvest_picker_entries(collection_id, picker_id);

create index if not exists idx_harvest_picker_entries_company_sync
  on public.harvest_picker_entries(company_id, sync_status, recorded_at desc);

create index if not exists idx_harvest_picker_entries_recorded_by
  on public.harvest_picker_entries(recorded_by_employee_id, recorded_at desc);

create unique index if not exists uq_harvest_picker_entries_company_client_entry
  on public.harvest_picker_entries(company_id, client_entry_id)
  where client_entry_id is not null;

-- =========================================================
-- 4) harvest_picker_totals
-- Fast per-picker summary inside a collection
-- =========================================================
create table if not exists public.harvest_picker_totals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  collection_id uuid not null,
  picker_id uuid not null,
  total_entries integer not null default 0,
  total_weight_kg numeric(12,3) not null default 0,
  total_crates integer not null default 0,
  total_units integer not null default 0,
  total_amount numeric(12,2) not null default 0,
  last_entry_at timestamptz,
  updated_at timestamptz not null default now(),

  constraint harvest_picker_totals_unique
    unique (company_id, collection_id, picker_id)
);

create index if not exists idx_harvest_picker_totals_company_collection
  on public.harvest_picker_totals(company_id, collection_id);

create index if not exists idx_harvest_picker_totals_collection_amount
  on public.harvest_picker_totals(collection_id, total_amount desc);

-- =========================================================
-- 5) harvest_collection_totals
-- Fast collection-wide summary
-- =========================================================
create table if not exists public.harvest_collection_totals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  collection_id uuid not null,
  total_pickers integer not null default 0,
  total_entries integer not null default 0,
  total_weight_kg numeric(12,3) not null default 0,
  total_crates integer not null default 0,
  total_units integer not null default 0,
  total_gross_amount numeric(12,2) not null default 0,
  total_paid_amount numeric(12,2) not null default 0,
  pending_amount numeric(12,2) not null default 0,
  updated_at timestamptz not null default now(),

  constraint harvest_collection_totals_unique
    unique (company_id, collection_id)
);

create index if not exists idx_harvest_collection_totals_company
  on public.harvest_collection_totals(company_id);

create index if not exists idx_harvest_collection_totals_collection
  on public.harvest_collection_totals(collection_id);

-- =========================================================
-- 6) picker_payments
-- Payments made to pickers
-- =========================================================
create table if not exists public.picker_payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  collection_id uuid not null,
  picker_id uuid not null,
  amount numeric(12,2) not null,
  payment_method text,
  reference_number text,
  paid_by_employee_id uuid,
  paid_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now(),

  constraint picker_payments_amount_check
    check (amount >= 0)
);

create index if not exists idx_picker_payments_company_collection_picker
  on public.picker_payments(company_id, collection_id, picker_id);

create index if not exists idx_picker_payments_company_paid_at
  on public.picker_payments(company_id, paid_at desc);

-- =========================================================
-- 7) harvest_entry_events
-- Audit / debug / correction trail
-- =========================================================
create table if not exists public.harvest_entry_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  collection_id uuid,
  picker_id uuid,
  entry_id uuid,
  event_type text not null,
  actor_employee_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_harvest_entry_events_company_created
  on public.harvest_entry_events(company_id, created_at desc);

create index if not exists idx_harvest_entry_events_collection
  on public.harvest_entry_events(collection_id, created_at desc);

create index if not exists idx_harvest_entry_events_picker
  on public.harvest_entry_events(picker_id, created_at desc);

create index if not exists idx_harvest_entry_events_entry
  on public.harvest_entry_events(entry_id);

-- =========================================================
-- 8) Foreign keys
-- Skip FKs to public.projects and public.employees (they may be views).
-- Only add FKs between harvest_* tables.
-- =========================================================
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'harvest_picker_entries_collection_fk')
  then
    alter table public.harvest_picker_entries
      add constraint harvest_picker_entries_collection_fk
      foreign key (collection_id) references public.harvest_collections(id) on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'harvest_picker_entries_picker_fk')
  then
    alter table public.harvest_picker_entries
      add constraint harvest_picker_entries_picker_fk
      foreign key (picker_id) references public.harvest_pickers(id) on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'harvest_picker_totals_collection_fk')
  then
    alter table public.harvest_picker_totals
      add constraint harvest_picker_totals_collection_fk
      foreign key (collection_id) references public.harvest_collections(id) on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'harvest_picker_totals_picker_fk')
  then
    alter table public.harvest_picker_totals
      add constraint harvest_picker_totals_picker_fk
      foreign key (picker_id) references public.harvest_pickers(id) on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'harvest_collection_totals_collection_fk')
  then
    alter table public.harvest_collection_totals
      add constraint harvest_collection_totals_collection_fk
      foreign key (collection_id) references public.harvest_collections(id) on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'picker_payments_collection_fk')
  then
    alter table public.picker_payments
      add constraint picker_payments_collection_fk
      foreign key (collection_id) references public.harvest_collections(id) on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'picker_payments_picker_fk')
  then
    alter table public.picker_payments
      add constraint picker_payments_picker_fk
      foreign key (picker_id) references public.harvest_pickers(id) on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'harvest_entry_events_collection_fk')
  then
    alter table public.harvest_entry_events
      add constraint harvest_entry_events_collection_fk
      foreign key (collection_id) references public.harvest_collections(id) on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'harvest_entry_events_picker_fk')
  then
    alter table public.harvest_entry_events
      add constraint harvest_entry_events_picker_fk
      foreign key (picker_id) references public.harvest_pickers(id) on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'harvest_entry_events_entry_fk')
  then
    alter table public.harvest_entry_events
      add constraint harvest_entry_events_entry_fk
      foreign key (entry_id) references public.harvest_picker_entries(id) on delete cascade;
  end if;
end $$;

-- =========================================================
-- 9) updated_at helper
-- =========================================================
create or replace function public.set_row_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_harvest_collections_updated_at on public.harvest_collections;
create trigger trg_harvest_collections_updated_at
before update on public.harvest_collections
for each row
execute function public.set_row_updated_at();

drop trigger if exists trg_harvest_pickers_updated_at on public.harvest_pickers;
create trigger trg_harvest_pickers_updated_at
before update on public.harvest_pickers
for each row
execute function public.set_row_updated_at();

drop trigger if exists trg_harvest_picker_totals_updated_at on public.harvest_picker_totals;
create trigger trg_harvest_picker_totals_updated_at
before update on public.harvest_picker_totals
for each row
execute function public.set_row_updated_at();

drop trigger if exists trg_harvest_collection_totals_updated_at on public.harvest_collection_totals;
create trigger trg_harvest_collection_totals_updated_at
before update on public.harvest_collection_totals
for each row
execute function public.set_row_updated_at();

-- =========================================================
-- 10) Helper function: initialize collection totals row
-- =========================================================
create or replace function public.ensure_harvest_collection_totals(
  p_company_id uuid,
  p_collection_id uuid
)
returns void
language plpgsql
as $$
begin
  insert into public.harvest_collection_totals (
    company_id,
    collection_id
  )
  values (
    p_company_id,
    p_collection_id
  )
  on conflict (company_id, collection_id) do nothing;
end;
$$;

-- =========================================================
-- 11) Trigger: after collection insert, create totals row
-- =========================================================
create or replace function public.trg_init_collection_totals()
returns trigger
language plpgsql
as $$
begin
  perform public.ensure_harvest_collection_totals(new.company_id, new.id);
  return new;
end;
$$;

drop trigger if exists trg_harvest_collection_init_totals on public.harvest_collections;
create trigger trg_harvest_collection_init_totals
after insert on public.harvest_collections
for each row
execute function public.trg_init_collection_totals();

-- =========================================================
-- 12) Trigger: maintain picker totals + collection totals after entry insert
-- =========================================================
create or replace function public.trg_after_harvest_entry_insert()
returns trigger
language plpgsql
as $$
begin
  -- Per-picker totals
  insert into public.harvest_picker_totals (
    company_id,
    collection_id,
    picker_id,
    total_entries,
    total_weight_kg,
    total_crates,
    total_units,
    total_amount,
    last_entry_at
  )
  values (
    new.company_id,
    new.collection_id,
    new.picker_id,
    case when new.is_voided then 0 else 1 end,
    case when new.is_voided then 0 else new.weight_kg end,
    case when new.is_voided then 0 else new.crate_count end,
    case when new.is_voided then 0 else new.unit_count end,
    case when new.is_voided then 0 else new.gross_amount end,
    new.recorded_at
  )
  on conflict (company_id, collection_id, picker_id)
  do update set
    total_entries = public.harvest_picker_totals.total_entries + case when new.is_voided then 0 else 1 end,
    total_weight_kg = public.harvest_picker_totals.total_weight_kg + case when new.is_voided then 0 else new.weight_kg end,
    total_crates = public.harvest_picker_totals.total_crates + case when new.is_voided then 0 else new.crate_count end,
    total_units = public.harvest_picker_totals.total_units + case when new.is_voided then 0 else new.unit_count end,
    total_amount = public.harvest_picker_totals.total_amount + case when new.is_voided then 0 else new.gross_amount end,
    last_entry_at = greatest(coalesce(public.harvest_picker_totals.last_entry_at, new.recorded_at), new.recorded_at),
    updated_at = now();

  -- Collection totals base row
  perform public.ensure_harvest_collection_totals(new.company_id, new.collection_id);

  -- Collection totals aggregate update
  update public.harvest_collection_totals
  set
    total_entries = total_entries + case when new.is_voided then 0 else 1 end,
    total_weight_kg = total_weight_kg + case when new.is_voided then 0 else new.weight_kg end,
    total_crates = total_crates + case when new.is_voided then 0 else new.crate_count end,
    total_units = total_units + case when new.is_voided then 0 else new.unit_count end,
    total_gross_amount = total_gross_amount + case when new.is_voided then 0 else new.gross_amount end,
    pending_amount = (total_gross_amount + case when new.is_voided then 0 else new.gross_amount end) - total_paid_amount,
    updated_at = now()
  where company_id = new.company_id
    and collection_id = new.collection_id;

  -- Recompute distinct pickers cheaply from picker totals
  update public.harvest_collection_totals hct
  set
    total_pickers = (
      select count(*)
      from public.harvest_picker_totals hpt
      where hpt.company_id = new.company_id
        and hpt.collection_id = new.collection_id
        and hpt.total_entries > 0
    ),
    updated_at = now()
  where hct.company_id = new.company_id
    and hct.collection_id = new.collection_id;

  -- Audit event
  insert into public.harvest_entry_events (
    company_id,
    collection_id,
    picker_id,
    entry_id,
    event_type,
    actor_employee_id,
    metadata
  )
  values (
    new.company_id,
    new.collection_id,
    new.picker_id,
    new.id,
    'entry_created',
    new.recorded_by_employee_id,
    jsonb_build_object(
      'weight_kg', new.weight_kg,
      'crate_count', new.crate_count,
      'unit_count', new.unit_count,
      'gross_amount', new.gross_amount,
      'client_entry_id', new.client_entry_id,
      'sync_status', new.sync_status
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_harvest_entry_after_insert on public.harvest_picker_entries;
create trigger trg_harvest_entry_after_insert
after insert on public.harvest_picker_entries
for each row
execute function public.trg_after_harvest_entry_insert();

-- =========================================================
-- 13) Trigger: update collection totals after payment insert
-- =========================================================
create or replace function public.trg_after_picker_payment_insert()
returns trigger
language plpgsql
as $$
begin
  perform public.ensure_harvest_collection_totals(new.company_id, new.collection_id);

  update public.harvest_collection_totals
  set
    total_paid_amount = total_paid_amount + new.amount,
    pending_amount = total_gross_amount - (total_paid_amount + new.amount),
    updated_at = now()
  where company_id = new.company_id
    and collection_id = new.collection_id;

  insert into public.harvest_entry_events (
    company_id,
    collection_id,
    picker_id,
    event_type,
    actor_employee_id,
    metadata
  )
  values (
    new.company_id,
    new.collection_id,
    new.picker_id,
    'payment_made',
    new.paid_by_employee_id,
    jsonb_build_object(
      'amount', new.amount,
      'payment_method', new.payment_method,
      'reference_number', new.reference_number
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_picker_payments_after_insert on public.picker_payments;
create trigger trg_picker_payments_after_insert
after insert on public.picker_payments
for each row
execute function public.trg_after_picker_payment_insert();

-- =========================================================
-- 14) Helper: insert a picker entry safely
-- Handles entry_number assignment and duplicate client_entry_id
-- =========================================================
create or replace function public.create_harvest_picker_entry(
  p_company_id uuid,
  p_collection_id uuid,
  p_picker_id uuid,
  p_weight_kg numeric,
  p_crate_count integer,
  p_unit_count integer,
  p_price_snapshot numeric,
  p_gross_amount numeric,
  p_recorded_by_employee_id uuid,
  p_recorded_at timestamptz default now(),
  p_device_id text default null,
  p_client_entry_id text default null,
  p_entry_source text default 'manual',
  p_sync_status text default 'synced',
  p_notes text default null
)
returns public.harvest_picker_entries
language plpgsql
as $$
declare
  v_existing public.harvest_picker_entries;
  v_next_entry_number integer;
  v_row public.harvest_picker_entries;
begin
  if p_client_entry_id is not null then
    select *
    into v_existing
    from public.harvest_picker_entries
    where company_id = p_company_id
      and client_entry_id = p_client_entry_id
    limit 1;

    if found then
      return v_existing;
    end if;
  end if;

  select coalesce(max(entry_number), 0) + 1
  into v_next_entry_number
  from public.harvest_picker_entries
  where company_id = p_company_id
    and collection_id = p_collection_id
    and picker_id = p_picker_id;

  insert into public.harvest_picker_entries (
    company_id,
    collection_id,
    picker_id,
    entry_number,
    weight_kg,
    crate_count,
    unit_count,
    price_snapshot,
    gross_amount,
    recorded_by_employee_id,
    recorded_at,
    device_id,
    client_entry_id,
    entry_source,
    sync_status,
    notes
  )
  values (
    p_company_id,
    p_collection_id,
    p_picker_id,
    v_next_entry_number,
    coalesce(p_weight_kg, 0),
    coalesce(p_crate_count, 0),
    coalesce(p_unit_count, 0),
    coalesce(p_price_snapshot, 0),
    coalesce(p_gross_amount, 0),
    p_recorded_by_employee_id,
    coalesce(p_recorded_at, now()),
    p_device_id,
    p_client_entry_id,
    coalesce(p_entry_source, 'manual'),
    coalesce(p_sync_status, 'synced'),
    p_notes
  )
  returning *
  into v_row;

  return v_row;
end;
$$;

commit;
