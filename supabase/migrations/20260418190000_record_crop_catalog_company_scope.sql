begin;

-- Tenant-scoped custom crops for notebook + project wizard (Supabase source of truth).
alter table public.record_crop_catalog
  add column if not exists company_id uuid references core.companies (id) on delete cascade;

drop index if exists public.record_crop_catalog_slug_uniq;

-- Per-tenant slugs; legacy global rows (company_id null) keep slug unique among globals only.
create unique index if not exists record_crop_catalog_company_slug_uniq
  on public.record_crop_catalog (company_id, slug)
  where company_id is not null;

create unique index if not exists record_crop_catalog_slug_global_uniq
  on public.record_crop_catalog (slug)
  where company_id is null;

create index if not exists record_crop_catalog_company_id_idx
  on public.record_crop_catalog (company_id);

drop policy if exists "record_crop_catalog_select" on public.record_crop_catalog;
drop policy if exists "record_crop_catalog_insert" on public.record_crop_catalog;
drop policy if exists "record_crop_catalog_update" on public.record_crop_catalog;
drop policy if exists "record_crop_catalog_delete" on public.record_crop_catalog;

create policy "record_crop_catalog_select"
on public.record_crop_catalog
for select
to authenticated
using (
  public.is_developer()
  or (
    company_id is not null
    and core.is_company_member(company_id)
  )
);

create policy "record_crop_catalog_insert"
on public.record_crop_catalog
for insert
to authenticated
with check (
  company_id is not null
  and (
    public.is_developer()
    or core.is_company_member(company_id)
  )
);

create policy "record_crop_catalog_update"
on public.record_crop_catalog
for update
to authenticated
using (
  public.is_developer()
  or (
    company_id is not null
    and core.is_company_member(company_id)
  )
)
with check (
  company_id is not null
  and (
    public.is_developer()
    or core.is_company_member(company_id)
  )
);

create policy "record_crop_catalog_delete"
on public.record_crop_catalog
for delete
to authenticated
using (
  public.is_developer()
  or (
    company_id is not null
    and core.is_company_member(company_id)
  )
);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'record_crop_catalog'
    ) then
      execute 'alter publication supabase_realtime add table public.record_crop_catalog';
    end if;
  end if;
end $$;

commit;
