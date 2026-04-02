begin;

alter table public.farm_notebook_entries
  add column if not exists structured_blocks jsonb not null default '[]'::jsonb;

alter table public.farm_notebook_entries
  add column if not exists raw_text text;

update public.farm_notebook_entries
set raw_text = coalesce(raw_text, content)
where raw_text is null;

comment on column public.farm_notebook_entries.content is 'Raw note text (user-editable; same as raw_text on save).';
comment on column public.farm_notebook_entries.raw_text is 'Mirror of raw note text for consumers; kept in sync with content on save.';
comment on column public.farm_notebook_entries.structured_blocks is 'Auto-derived structured blocks from content (JSON array), updated on save.';

commit;
