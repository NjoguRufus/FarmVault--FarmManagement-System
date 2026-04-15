begin;

alter table projects.farms
  add column if not exists status text not null default 'active' check (status in ('active', 'closed')),
  add column if not exists lease_amount_paid numeric(14,2) null check (lease_amount_paid is null or lease_amount_paid >= 0),
  add column if not exists lease_expires_at date null;

create index if not exists idx_projects_farms_company_status
  on projects.farms (company_id, status, created_at desc);

commit;
