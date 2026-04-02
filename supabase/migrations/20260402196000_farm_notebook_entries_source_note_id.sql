begin;

alter table public.farm_notebook_entries
  add column if not exists source_note_id uuid;

create index if not exists farm_notebook_entries_source_note_id_idx
  on public.farm_notebook_entries (source_note_id);

-- Prevent duplicate copies of the same source note per company
create unique index if not exists farm_notebook_entries_company_source_note_uniq
  on public.farm_notebook_entries (company_id, source_note_id)
  where source_note_id is not null;

commit;

