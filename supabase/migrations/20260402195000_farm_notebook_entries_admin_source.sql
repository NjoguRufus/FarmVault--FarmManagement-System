begin;

alter table public.farm_notebook_entries
  add column if not exists source text,
  add column if not exists is_admin_note boolean default false,
  add column if not exists sent_by_developer boolean,
  add column if not exists developer_updated boolean default false;

create index if not exists farm_notebook_entries_is_admin_note_idx
  on public.farm_notebook_entries (company_id, is_admin_note, updated_at desc);

commit;

