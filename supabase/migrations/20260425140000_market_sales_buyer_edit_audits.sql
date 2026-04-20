-- Audit trail for edits to market buyer (sales) notebook lines — tomato + fallback.

create table if not exists harvest.tomato_market_sales_entry_edit_audits (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  sales_entry_id uuid not null references harvest.tomato_market_sales_entries(id) on delete cascade,
  reason text not null check (length(trim(reason)) >= 8),
  snapshot_before jsonb not null,
  snapshot_after jsonb not null,
  editor_user_id text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_tomato_sales_edit_audits_entry_created
  on harvest.tomato_market_sales_entry_edit_audits (sales_entry_id, created_at desc);

alter table harvest.tomato_market_sales_entry_edit_audits enable row level security;

create policy tomato_market_sales_entry_edit_audits_select
  on harvest.tomato_market_sales_entry_edit_audits
  for select
  using (
    public.is_developer()
    or (
      core.is_company_member(company_id)
      and (
        core.is_company_admin(company_id)
        or not harvest.user_is_sales_broker_in_company(company_id)
        or harvest.dispatch_broker_matches_me(
          (select e.market_dispatch_id from harvest.tomato_market_sales_entries e where e.id = sales_entry_id)
        )
      )
    )
  );

create policy tomato_market_sales_entry_edit_audits_insert
  on harvest.tomato_market_sales_entry_edit_audits
  for insert
  with check (
    core.is_company_member(company_id)
    and (
      core.is_company_admin(company_id)
      or not harvest.user_is_sales_broker_in_company(company_id)
      or harvest.dispatch_broker_matches_me(
        (select e.market_dispatch_id from harvest.tomato_market_sales_entries e where e.id = sales_entry_id)
      )
    )
  );

grant select, insert on harvest.tomato_market_sales_entry_edit_audits to authenticated, service_role;

-- Fallback crop market sales edits
create table if not exists harvest.fallback_market_sales_entry_edit_audits (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  sales_entry_id uuid not null references harvest.fallback_market_sales_entries(id) on delete cascade,
  reason text not null check (length(trim(reason)) >= 8),
  snapshot_before jsonb not null,
  snapshot_after jsonb not null,
  editor_user_id text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_fallback_sales_edit_audits_entry_created
  on harvest.fallback_market_sales_entry_edit_audits (sales_entry_id, created_at desc);

alter table harvest.fallback_market_sales_entry_edit_audits enable row level security;

create policy fallback_market_sales_entry_edit_audits_select
  on harvest.fallback_market_sales_entry_edit_audits
  for select
  using (
    public.is_developer()
    or (
      core.is_company_member(company_id)
      and (
        core.is_company_admin(company_id)
        or not harvest.user_is_sales_broker_in_company(company_id)
        or harvest.fallback_dispatch_broker_matches_me(
          (select e.market_dispatch_id from harvest.fallback_market_sales_entries e where e.id = sales_entry_id)
        )
      )
    )
  );

create policy fallback_market_sales_entry_edit_audits_insert
  on harvest.fallback_market_sales_entry_edit_audits
  for insert
  with check (
    core.is_company_member(company_id)
    and (
      core.is_company_admin(company_id)
      or not harvest.user_is_sales_broker_in_company(company_id)
      or harvest.fallback_dispatch_broker_matches_me(
        (select e.market_dispatch_id from harvest.fallback_market_sales_entries e where e.id = sales_entry_id)
      )
    )
  );

grant select, insert on harvest.fallback_market_sales_entry_edit_audits to authenticated, service_role;
