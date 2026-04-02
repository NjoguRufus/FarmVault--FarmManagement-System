begin;

create extension if not exists pg_trgm;

create table if not exists public.record_crop_catalog (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  created_by text,
  created_at timestamptz default now()
);

create unique index if not exists record_crop_catalog_slug_uniq on public.record_crop_catalog (slug);
create index if not exists record_crop_catalog_name_trgm on public.record_crop_catalog using gin (name gin_trgm_ops);

alter table public.record_crop_catalog enable row level security;

drop policy if exists "record_crop_catalog_select" on public.record_crop_catalog;
create policy "record_crop_catalog_select"
on public.record_crop_catalog
for select
to authenticated
using (public.fv_has_clerk_session() or public.is_developer());

drop policy if exists "record_crop_catalog_insert" on public.record_crop_catalog;
create policy "record_crop_catalog_insert"
on public.record_crop_catalog
for insert
to authenticated
with check (public.fv_has_clerk_session() or public.is_developer());

commit;

