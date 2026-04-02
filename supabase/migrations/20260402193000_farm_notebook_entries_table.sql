begin;

create table if not exists public.farm_notebook_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  crop_slug text,
  title text,
  content text,
  attachments jsonb,
  created_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists farm_notebook_entries_company_crop_created_idx
  on public.farm_notebook_entries (company_id, crop_slug, created_at desc);

alter table public.farm_notebook_entries enable row level security;

-- SELECT
drop policy if exists "farm_notebook_entries_select_company" on public.farm_notebook_entries;
create policy "farm_notebook_entries_select_company"
on public.farm_notebook_entries
for select
to authenticated
using (
  public.is_developer()
  or
  company_id = coalesce(
    core.current_company_id(),
    (auth.jwt() ->> 'company_id')::uuid
  )
);

-- INSERT
drop policy if exists "farm_notebook_entries_insert_company" on public.farm_notebook_entries;
create policy "farm_notebook_entries_insert_company"
on public.farm_notebook_entries
for insert
to authenticated
with check (
  public.is_developer()
  or
  company_id = coalesce(
    core.current_company_id(),
    (auth.jwt() ->> 'company_id')::uuid
  )
);

-- UPDATE
drop policy if exists "farm_notebook_entries_update_company" on public.farm_notebook_entries;
create policy "farm_notebook_entries_update_company"
on public.farm_notebook_entries
for update
to authenticated
using (
  public.is_developer()
  or
  company_id = coalesce(
    core.current_company_id(),
    (auth.jwt() ->> 'company_id')::uuid
  )
)
with check (
  public.is_developer()
  or
  company_id = coalesce(
    core.current_company_id(),
    (auth.jwt() ->> 'company_id')::uuid
  )
);

-- DELETE
drop policy if exists "farm_notebook_entries_delete_company" on public.farm_notebook_entries;
create policy "farm_notebook_entries_delete_company"
on public.farm_notebook_entries
for delete
to authenticated
using (
  public.is_developer()
  or
  company_id = coalesce(
    core.current_company_id(),
    (auth.jwt() ->> 'company_id')::uuid
  )
);

create or replace function public.update_farm_notebook_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists farm_notebook_updated_at_trigger
on public.farm_notebook_entries;

create trigger farm_notebook_updated_at_trigger
before update
on public.farm_notebook_entries
for each row
execute function public.update_farm_notebook_updated_at();

commit;

