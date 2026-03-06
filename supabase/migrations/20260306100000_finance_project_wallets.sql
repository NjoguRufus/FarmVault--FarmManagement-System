-- finance.project_wallets and finance.project_wallet_ledger for Harvest Cash Wallet.
-- Source of truth: ledger; balance = sum(credits) - sum(debits) from project_wallet_ledger.

begin;

-- finance.project_wallets (one per company + project; registry/header)
create table if not exists finance.project_wallets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  project_id uuid not null references projects.projects(id) on delete cascade,
  currency text not null default 'KES',
  created_at timestamptz not null default now(),
  unique(company_id, project_id)
);

create index if not exists idx_finance_project_wallets_company_project
  on finance.project_wallets(company_id, project_id);

-- finance.project_wallet_ledger (append-only; balance derived from credits - debits)
create table if not exists finance.project_wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  project_id uuid not null references projects.projects(id) on delete cascade,
  entry_type text not null check (entry_type in ('credit', 'debit')),
  amount numeric not null check (amount >= 0),
  note text null,
  ref_type text null,
  ref_id uuid null,
  created_by text not null default core.current_user_id(),
  created_at timestamptz not null default now()
);

create index if not exists idx_finance_project_wallet_ledger_company_project
  on finance.project_wallet_ledger(company_id, project_id, created_at desc);

-- RLS
alter table finance.project_wallets enable row level security;
alter table finance.project_wallet_ledger enable row level security;

-- project_wallets: SELECT for company members; INSERT/UPDATE for company admins
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'finance' and tablename = 'project_wallets' and policyname = 'project_wallets_select_member'
  ) then
    create policy project_wallets_select_member on finance.project_wallets
      for select using (core.is_company_member(company_id));
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'finance' and tablename = 'project_wallets' and policyname = 'project_wallets_insert_admin'
  ) then
    create policy project_wallets_insert_admin on finance.project_wallets
      for insert with check (core.is_company_admin(company_id));
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'finance' and tablename = 'project_wallets' and policyname = 'project_wallets_update_admin'
  ) then
    create policy project_wallets_update_admin on finance.project_wallets
      for update using (core.is_company_admin(company_id)) with check (core.is_company_admin(company_id));
  end if;
end$$;

-- project_wallet_ledger: SELECT and INSERT for company members
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'finance' and tablename = 'project_wallet_ledger' and policyname = 'project_wallet_ledger_select_member'
  ) then
    create policy project_wallet_ledger_select_member on finance.project_wallet_ledger
      for select using (core.is_company_member(company_id));
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'finance' and tablename = 'project_wallet_ledger' and policyname = 'project_wallet_ledger_insert_member'
  ) then
    create policy project_wallet_ledger_insert_member on finance.project_wallet_ledger
      for insert with check (
        core.is_company_member(company_id)
        and created_by = core.current_user_id()
      );
  end if;
end$$;

commit;
