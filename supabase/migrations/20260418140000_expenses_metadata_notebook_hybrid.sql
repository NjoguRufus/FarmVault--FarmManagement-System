begin;

-- finance.expenses: trace picker payments and linked records
alter table finance.expenses
  add column if not exists source text not null default 'manual';

alter table finance.expenses
  add column if not exists reference_id uuid null;

comment on column finance.expenses.source is 'Origin of the row: manual, picker_payment, etc.';
comment on column finance.expenses.reference_id is 'Optional linkage UUID (e.g. picker id or payment correlation).';

create index if not exists idx_finance_expenses_source_ref
  on finance.expenses (company_id, source, reference_id)
  where deleted_at is null;

-- Farm notebook: tie entries to farm + project (nullable for legacy rows)
alter table public.farm_notebook_entries
  add column if not exists farm_id uuid null references projects.farms(id) on delete set null;

alter table public.farm_notebook_entries
  add column if not exists project_id uuid null references projects.projects(id) on delete set null;

alter table public.farm_notebook_entries
  add column if not exists entry_kind text null default 'note';

comment on column public.farm_notebook_entries.entry_kind is 'note | work_record';

alter table public.farm_notebook_entries
  add column if not exists linked_stage text null;

comment on column public.farm_notebook_entries.linked_stage is 'Optional crop stage label when entry_kind is work_record.';

create index if not exists farm_notebook_entries_farm_project_idx
  on public.farm_notebook_entries (company_id, farm_id, project_id, updated_at desc);

commit;
