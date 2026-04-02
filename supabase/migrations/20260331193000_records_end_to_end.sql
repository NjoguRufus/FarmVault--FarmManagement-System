begin;

-- =============================================================================
-- FarmVault Records (Supabase) — end-to-end production RPCs + storage tables
-- - Company notebook crops (global + custom per tenant)
-- - Company crop notes (company-created + FarmVault/developer-sent)
-- - Attachments for notes
-- - Developer templates + distribution to companies
-- - Crop intelligence store (lightweight, deterministic)
-- =============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1) CORE TABLES
-- ---------------------------------------------------------------------------

-- Ensure the canonical records table exists for this module.
-- Some older FarmVault schemas used `public.records` instead of `public.company_records`.
do $$
begin
  if to_regclass('public.company_records') is null then
    create table public.company_records (
      id uuid primary key default gen_random_uuid(),
      company_id text not null,
      crop_id text not null,
      crop_name text,
      category text not null default 'General',
      title text not null,
      content text not null,
      highlights text[] not null default '{}'::text[],
      tags text[] not null default '{}'::text[],
      created_by text default auth.uid()::text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      source_type text not null default 'company',
      source_label text,
      developer_sender_id uuid,
      visibility text not null default 'visible'
    );

    create index idx_company_records_company_id on public.company_records(company_id);
    create index idx_company_records_crop_id on public.company_records(crop_id);
    create index idx_company_records_created_at on public.company_records(created_at desc);

    drop trigger if exists set_updated_at_company_records on public.company_records;
    create trigger set_updated_at_company_records
    before update on public.company_records
    for each row
    execute procedure public.set_updated_at();

    alter table public.company_records enable row level security;

    drop policy if exists company_records_select on public.company_records;
    create policy company_records_select on public.company_records
    for select using (public.is_developer() or public.row_company_matches_user(company_id));

    drop policy if exists company_records_insert on public.company_records;
    create policy company_records_insert on public.company_records
    for insert with check (
      auth.uid() is not null
      and company_id = public.current_company_id()::text
      and source_type = 'company'
    );

    drop policy if exists company_records_update on public.company_records;
    create policy company_records_update on public.company_records
    for update using (
      public.is_developer()
      or (company_id = public.current_company_id()::text and source_type = 'company' and coalesce(created_by,'') = auth.uid()::text)
    )
    with check (
      public.is_developer()
      or (company_id = public.current_company_id()::text and source_type = 'company' and coalesce(created_by,'') = auth.uid()::text)
    );
  end if;
end $$;

-- Per-company custom notebook crops (tenant-owned)
create table if not exists public.company_record_crops (
  -- NOTE: In newer FarmVault schemas, `companies` may be a view (or moved to core schema),
  -- which cannot be referenced by a foreign key. Keep as TEXT and enforce via RLS + app logic.
  company_id text not null,
  crop_id text not null,
  crop_name text not null,
  slug text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, crop_id)
);

create index if not exists idx_company_record_crops_company on public.company_record_crops(company_id);
create index if not exists idx_company_record_crops_slug on public.company_record_crops(company_id, slug);

drop trigger if exists set_updated_at_company_record_crops on public.company_record_crops;
create trigger set_updated_at_company_record_crops
before update on public.company_record_crops
for each row
execute procedure public.set_updated_at();

alter table public.company_record_crops enable row level security;

drop policy if exists company_record_crops_select on public.company_record_crops;
create policy company_record_crops_select on public.company_record_crops
for select using (public.is_developer() or public.row_company_matches_user(company_id));

drop policy if exists company_record_crops_insert on public.company_record_crops;
create policy company_record_crops_insert on public.company_record_crops
for insert with check (auth.uid() is not null and company_id = public.current_company_id()::text);

drop policy if exists company_record_crops_update on public.company_record_crops;
create policy company_record_crops_update on public.company_record_crops
for update using (public.is_developer() or public.row_company_matches_user(company_id))
with check (public.is_developer() or public.row_company_matches_user(company_id));

drop policy if exists company_record_crops_delete on public.company_record_crops;
create policy company_record_crops_delete on public.company_record_crops
for delete using (public.is_developer() or public.row_company_matches_user(company_id));

-- Company notebook notes (extend existing table for required fields)
alter table public.company_records
  add column if not exists source_type text not null default 'company',
  add column if not exists source_label text,
  add column if not exists developer_sender_id uuid,
  add column if not exists visibility text not null default 'visible';

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema='public' and table_name='company_records' and column_name='created_by'
      and is_nullable = 'NO'
  ) then
    alter table public.company_records alter column created_by drop not null;
  end if;
exception when others then
  -- best-effort; do not block migration if column is already nullable
  null;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'company_records'
      and con.conname = 'company_records_source_type_chk'
  ) then
    alter table public.company_records
      add constraint company_records_source_type_chk
      check (source_type in ('company','developer')) not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'company_records'
      and con.conname = 'company_records_visibility_chk'
  ) then
    alter table public.company_records
      add constraint company_records_visibility_chk
      check (visibility in ('visible','hidden')) not valid;
  end if;
end $$;

create index if not exists idx_company_records_company_crop_created on public.company_records(company_id, crop_id, created_at desc);
create index if not exists idx_company_records_source_type on public.company_records(source_type);

-- Attachments for company_records
create table if not exists public.company_record_attachments (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.company_records(id) on delete cascade,
  file_url text not null,
  file_name text,
  file_type text,
  created_at timestamptz not null default now()
);

create index if not exists idx_company_record_attachments_record on public.company_record_attachments(record_id);

alter table public.company_record_attachments enable row level security;

drop policy if exists company_record_attachments_select on public.company_record_attachments;
create policy company_record_attachments_select on public.company_record_attachments
for select using (
  public.is_developer()
  or exists (
    select 1
    from public.company_records r
    where r.id = company_record_attachments.record_id
      and public.row_company_matches_user(r.company_id)
  )
);

drop policy if exists company_record_attachments_insert on public.company_record_attachments;
create policy company_record_attachments_insert on public.company_record_attachments
for insert with check (
  public.is_developer()
  or exists (
    select 1
    from public.company_records r
    where r.id = company_record_attachments.record_id
      and r.company_id = public.current_company_id()::text
      and (r.source_type = 'company' and coalesce(r.created_by,'') = auth.uid()::text)
  )
);

drop policy if exists company_record_attachments_delete on public.company_record_attachments;
create policy company_record_attachments_delete on public.company_record_attachments
for delete using (
  public.is_developer()
  or exists (
    select 1
    from public.company_records r
    where r.id = company_record_attachments.record_id
      and r.company_id = public.current_company_id()::text
      and (r.source_type = 'company' and coalesce(r.created_by,'') = auth.uid()::text)
  )
);

-- Developer templates (FarmVault-sent notes originate here)
create table if not exists public.developer_crop_record_templates (
  id uuid primary key default gen_random_uuid(),
  crop_id text not null,
  title text not null,
  content text not null,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_dev_templates_crop on public.developer_crop_record_templates(crop_id, created_at desc);

drop trigger if exists set_updated_at_developer_crop_record_templates on public.developer_crop_record_templates;
create trigger set_updated_at_developer_crop_record_templates
before update on public.developer_crop_record_templates
for each row
execute procedure public.set_updated_at();

alter table public.developer_crop_record_templates enable row level security;

drop policy if exists dev_templates_all_developer on public.developer_crop_record_templates;
create policy dev_templates_all_developer on public.developer_crop_record_templates
for all
to authenticated
using (admin.is_developer(auth.uid()))
with check (admin.is_developer(auth.uid()));

-- ---------------------------------------------------------------------------
-- 2) CROP INTELLIGENCE STORE (minimal, structured)
-- ---------------------------------------------------------------------------

create table if not exists public.crop_knowledge_profiles (
  crop_id text primary key,
  maturity_min_days int,
  maturity_max_days int,
  best_timing_notes text,
  harvest_window_notes text,
  seasonal_notes text,
  fertilizer_notes text,
  market_notes text,
  irrigation_notes text,
  general_notes text,
  updated_at timestamptz not null default now()
);

create table if not exists public.crop_knowledge_challenges (
  id uuid primary key default gen_random_uuid(),
  crop_id text not null,
  challenge_name text not null,
  challenge_type text not null,
  severity text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_crop_knowledge_challenges_crop on public.crop_knowledge_challenges(crop_id, created_at desc);

create table if not exists public.crop_knowledge_practices (
  id uuid primary key default gen_random_uuid(),
  crop_id text not null,
  title text not null,
  practice_type text not null,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_crop_knowledge_practices_crop on public.crop_knowledge_practices(crop_id, created_at desc);

create table if not exists public.crop_knowledge_chemicals (
  id uuid primary key default gen_random_uuid(),
  crop_id text not null,
  chemical_name text not null,
  purpose text,
  dosage text,
  stage_notes text,
  phi_notes text,
  mix_notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_crop_knowledge_chemicals_crop on public.crop_knowledge_chemicals(crop_id, created_at desc);

create table if not exists public.crop_knowledge_timing_windows (
  id uuid primary key default gen_random_uuid(),
  crop_id text not null,
  title text not null,
  planting_start text,
  planting_end text,
  harvest_start text,
  harvest_end text,
  duration_notes text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_crop_knowledge_timing_windows_crop on public.crop_knowledge_timing_windows(crop_id, created_at desc);

alter table public.crop_knowledge_profiles enable row level security;
alter table public.crop_knowledge_challenges enable row level security;
alter table public.crop_knowledge_practices enable row level security;
alter table public.crop_knowledge_chemicals enable row level security;
alter table public.crop_knowledge_timing_windows enable row level security;

-- Read: signed-in users. Write: developers only (matches UI gating)
drop policy if exists crop_knowledge_profiles_select on public.crop_knowledge_profiles;
create policy crop_knowledge_profiles_select on public.crop_knowledge_profiles
for select using (auth.uid() is not null);
drop policy if exists crop_knowledge_profiles_write on public.crop_knowledge_profiles;
create policy crop_knowledge_profiles_write on public.crop_knowledge_profiles
for all using (admin.is_developer(auth.uid())) with check (admin.is_developer(auth.uid()));

drop policy if exists crop_knowledge_challenges_select on public.crop_knowledge_challenges;
create policy crop_knowledge_challenges_select on public.crop_knowledge_challenges
for select using (auth.uid() is not null);
drop policy if exists crop_knowledge_challenges_write on public.crop_knowledge_challenges;
create policy crop_knowledge_challenges_write on public.crop_knowledge_challenges
for all using (admin.is_developer(auth.uid())) with check (admin.is_developer(auth.uid()));

drop policy if exists crop_knowledge_practices_select on public.crop_knowledge_practices;
create policy crop_knowledge_practices_select on public.crop_knowledge_practices
for select using (auth.uid() is not null);
drop policy if exists crop_knowledge_practices_write on public.crop_knowledge_practices;
create policy crop_knowledge_practices_write on public.crop_knowledge_practices
for all using (admin.is_developer(auth.uid())) with check (admin.is_developer(auth.uid()));

drop policy if exists crop_knowledge_chemicals_select on public.crop_knowledge_chemicals;
create policy crop_knowledge_chemicals_select on public.crop_knowledge_chemicals
for select using (auth.uid() is not null);
drop policy if exists crop_knowledge_chemicals_write on public.crop_knowledge_chemicals;
create policy crop_knowledge_chemicals_write on public.crop_knowledge_chemicals
for all using (admin.is_developer(auth.uid())) with check (admin.is_developer(auth.uid()));

drop policy if exists crop_knowledge_timing_windows_select on public.crop_knowledge_timing_windows;
create policy crop_knowledge_timing_windows_select on public.crop_knowledge_timing_windows
for select using (auth.uid() is not null);
drop policy if exists crop_knowledge_timing_windows_write on public.crop_knowledge_timing_windows;
create policy crop_knowledge_timing_windows_write on public.crop_knowledge_timing_windows
for all using (admin.is_developer(auth.uid())) with check (admin.is_developer(auth.uid()));

-- ---------------------------------------------------------------------------
-- 3) RPC HELPERS
-- ---------------------------------------------------------------------------

create or replace function public.fv_slugify(p_text text)
returns text
language sql
immutable
as $$
  select trim(both '-' from regexp_replace(lower(coalesce(p_text,'')), '[^a-z0-9]+', '-', 'g'));
$$;

-- Safe crop name resolver across schema variants.
-- Avoids hard dependency on `public.crops` which may not exist in some deployments.
create or replace function public.fv_crop_name(p_crop_id text, p_fallback text default null)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if p_crop_id is null or trim(p_crop_id) = '' then
    return coalesce(nullif(trim(p_fallback),''), '');
  end if;

  if to_regclass('public.crops') is not null then
    execute 'select c.name::text from public.crops c where c.id::text = $1 limit 1'
      into v_name
      using p_crop_id;
  end if;

  return coalesce(nullif(trim(v_name),''), nullif(trim(p_fallback),''), p_crop_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) COMPANY-SIDE RPCs
-- ---------------------------------------------------------------------------

create or replace function public.create_company_record_crop(
  p_company_id text,
  p_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id text := coalesce(nullif(trim(p_company_id),''), public.current_company_id()::text);
  v_name text := trim(coalesce(p_name,''));
  v_slug text;
  v_crop_id text;
begin
  if v_company_id is null or v_company_id = '' then
    raise exception 'company_id is required';
  end if;
  if v_name = '' then
    raise exception 'name is required';
  end if;
  if not (public.is_developer() or v_company_id = public.current_company_id()::text) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  v_slug := public.fv_slugify(v_name);
  if v_slug = '' then
    raise exception 'invalid crop name';
  end if;

  -- Ensure uniqueness within a company: use slug as crop_id for custom crops.
  v_crop_id := 'custom:' || v_slug;

  insert into public.company_record_crops (company_id, crop_id, crop_name, slug)
  values (v_company_id, v_crop_id, v_name, v_slug)
  on conflict (company_id, crop_id) do update set
    crop_name = excluded.crop_name,
    slug = excluded.slug,
    updated_at = now();
end;
$$;

create or replace function public.list_company_record_crops(p_company_id text)
returns table (
  crop_id text,
  crop_name text,
  slug text,
  is_global boolean,
  records_count int,
  last_updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_company_id text := coalesce(nullif(trim(p_company_id),''), public.current_company_id()::text);
begin
  if v_company_id is null or v_company_id = '' then
    return;
  end if;

  -- Tenant guard: allow developers or the current tenant only.
  if not (public.is_developer() or v_company_id = public.current_company_id()::text) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return query
  with global_crops as (
    -- Derive global crops from what exists in records/templates/intelligence.
    select
      x.crop_id,
      x.crop_name,
      x.crop_id as slug,
      true as is_global
    from (
      select distinct
        trim(coalesce(r.crop_id,'')) as crop_id,
        nullif(trim(coalesce(r.crop_name,'')),'') as crop_name
      from public.company_records r
      where r.crop_id is not null
        and r.crop_id <> ''
        and r.crop_id not like 'custom:%'

      union

      select distinct
        trim(coalesce(t.crop_id,'')) as crop_id,
        null as crop_name
      from public.developer_crop_record_templates t
      where t.crop_id is not null
        and t.crop_id <> ''
        and t.crop_id not like 'custom:%'

      union

      select distinct
        trim(coalesce(p.crop_id,'')) as crop_id,
        null as crop_name
      from public.crop_knowledge_profiles p
      where p.crop_id is not null
        and p.crop_id <> ''
        and p.crop_id not like 'custom:%'
    ) x
    where x.crop_id <> ''
  ),
  global_crops_named as (
    select
      gc.crop_id,
      coalesce(
        gc.crop_name,
        initcap(replace(replace(gc.crop_id, '_', ' '), '-', ' '))
      ) as crop_name,
      gc.slug,
      gc.is_global
    from global_crops gc
  ),
  custom_crops as (
    select
      cc.crop_id,
      cc.crop_name,
      cc.slug,
      false as is_global
    from public.company_record_crops cc
    where cc.company_id = v_company_id
  ),
  all_crops as (
    select * from global_crops_named
    union all
    select * from custom_crops
  ),
  notes as (
    select
      r.crop_id,
      count(*)::int as records_count,
      max(coalesce(r.updated_at, r.created_at)) as last_updated_at
    from public.company_records r
    where r.company_id = v_company_id
      and r.visibility = 'visible'
    group by r.crop_id
  )
  select
    ac.crop_id,
    ac.crop_name,
    ac.slug,
    ac.is_global,
    coalesce(n.records_count, 0) as records_count,
    n.last_updated_at
  from all_crops ac
  left join notes n on n.crop_id = ac.crop_id
  order by
    coalesce(n.last_updated_at, '1900-01-01'::timestamptz) desc,
    ac.crop_name asc;
end;
$$;

create or replace function public.create_company_crop_record(
  p_company_id text,
  p_crop_id text,
  p_title text,
  p_content text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id text := coalesce(nullif(trim(p_company_id),''), public.current_company_id()::text);
  v_crop_id text := trim(coalesce(p_crop_id,''));
  v_title text := trim(coalesce(p_title,''));
  v_content text := trim(coalesce(p_content,''));
  v_id uuid;
begin
  if v_company_id is null or v_company_id = '' then
    raise exception 'company_id is required';
  end if;
  if v_crop_id = '' then
    raise exception 'crop_id is required';
  end if;
  if v_title = '' then
    raise exception 'title is required';
  end if;
  if v_content = '' then
    raise exception 'content is required';
  end if;
  if v_company_id <> public.current_company_id()::text and not public.is_developer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  insert into public.company_records (
    company_id, crop_id, category, title, content, highlights, tags,
    created_by, source_type, source_label, developer_sender_id, visibility
  )
  values (
    v_company_id, v_crop_id, 'General', v_title, v_content, '{}'::text[], '{}'::text[],
    auth.uid()::text, 'company', null, null, 'visible'
  )
  returning id into v_id;

  return jsonb_build_object('record_id', v_id::text);
end;
$$;

create or replace function public.update_crop_record(
  p_record_id text,
  p_title text default null,
  p_content text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := nullif(trim(coalesce(p_record_id,'')),'')::uuid;
  v_row public.company_records%rowtype;
begin
  if v_id is null then
    raise exception 'record_id is required';
  end if;

  select * into v_row from public.company_records where id = v_id;
  if not found then
    raise exception 'record not found';
  end if;

  if not (public.is_developer() or public.row_company_matches_user(v_row.company_id)) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  -- Company users can only edit their own company-created notes.
  if not public.is_developer() then
    if v_row.source_type <> 'company' then
      raise exception 'cannot edit FarmVault notes' using errcode = '42501';
    end if;
    if coalesce(v_row.created_by,'') <> auth.uid()::text then
      raise exception 'not authorized' using errcode = '42501';
    end if;
  end if;

  update public.company_records
  set
    title = coalesce(nullif(trim(p_title),''), title),
    content = coalesce(nullif(trim(p_content),''), content),
    updated_at = now()
  where id = v_id;
end;
$$;

create or replace function public.add_crop_record_attachment(
  p_record_id text,
  p_file_url text,
  p_file_name text default null,
  p_file_type text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := nullif(trim(coalesce(p_record_id,'')),'')::uuid;
  v_url text := trim(coalesce(p_file_url,''));
  v_row public.company_records%rowtype;
begin
  if v_id is null then
    raise exception 'record_id is required';
  end if;
  if v_url = '' then
    raise exception 'file_url is required';
  end if;

  select * into v_row from public.company_records where id = v_id;
  if not found then
    raise exception 'record not found';
  end if;

  if not (public.is_developer() or public.row_company_matches_user(v_row.company_id)) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if not public.is_developer() then
    if v_row.source_type <> 'company' or coalesce(v_row.created_by,'') <> auth.uid()::text then
      raise exception 'not authorized' using errcode = '42501';
    end if;
  end if;

  insert into public.company_record_attachments (record_id, file_url, file_name, file_type)
  values (v_id, v_url, nullif(trim(p_file_name),''), nullif(trim(p_file_type),''));
end;
$$;

create or replace function public.list_crop_records(
  p_company_id text,
  p_crop_id text,
  p_limit int default 20,
  p_offset int default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_company_id text := coalesce(nullif(trim(p_company_id),''), public.current_company_id()::text);
  v_crop_id text := trim(coalesce(p_crop_id,''));
  v_rows jsonb := '[]'::jsonb;
  v_total int := 0;
begin
  if v_company_id is null or v_company_id = '' then
    return jsonb_build_object('rows','[]'::jsonb,'total',0);
  end if;
  if v_crop_id = '' then
    return jsonb_build_object('rows','[]'::jsonb,'total',0);
  end if;
  if not (public.is_developer() or v_company_id = public.current_company_id()::text) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select count(*)::int
  into v_total
  from public.company_records r
  where r.company_id = v_company_id
    and r.crop_id = v_crop_id
    and r.visibility = 'visible';

  select coalesce(jsonb_agg(row_to_json(q)), '[]'::jsonb)
  into v_rows
  from (
    select
      r.id::text as record_id,
      r.company_id as company_id,
      r.crop_id as crop_id,
      public.fv_crop_name(r.crop_id, r.crop_name) as crop_name,
      r.title as title,
      left(coalesce(r.content,''), 220) as content_preview,
      (case when r.source_type = 'developer' then 'developer' else 'company' end)::text as source_type,
      r.created_by as created_by,
      r.developer_sender_id::text as developer_sender_id,
      r.created_at as created_at,
      r.updated_at as updated_at,
      (select count(*)::int from public.company_record_attachments a where a.record_id = r.id) as attachments_count
    from public.company_records r
    where r.company_id = v_company_id
      and r.crop_id = v_crop_id
      and r.visibility = 'visible'
    order by coalesce(r.updated_at, r.created_at) desc nulls last
    limit greatest(p_limit, 0)
    offset greatest(p_offset, 0)
  ) q;

  return jsonb_build_object('rows', v_rows, 'total', v_total);
end;
$$;

create or replace function public.get_crop_record_detail(p_record_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id uuid := nullif(trim(coalesce(p_record_id,'')),'')::uuid;
  v_row jsonb;
  v_atts jsonb := '[]'::jsonb;
begin
  if v_id is null then
    return null;
  end if;

  -- Try company record first (company visibility + developer access)
  select jsonb_build_object(
    'record_id', r.id::text,
    'company_id', r.company_id,
    'company_name', (select c.name from core.companies c where c.id::text = r.company_id),
    'crop_id', r.crop_id,
    'crop_name', public.fv_crop_name(r.crop_id, r.crop_name),
    'title', r.title,
    'content', r.content,
    'source_type', (case when r.source_type = 'developer' then 'developer' else 'company' end),
    'created_by', r.created_by,
    'developer_sender_id', r.developer_sender_id::text,
    'created_at', r.created_at,
    'updated_at', r.updated_at
  )
  into v_row
  from public.company_records r
  where r.id = v_id
    and r.visibility = 'visible'
    and (public.is_developer() or public.row_company_matches_user(r.company_id));

  if v_row is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', a.id::text,
      'file_url', a.file_url,
      'file_name', a.file_name,
      'file_type', a.file_type,
      'created_at', a.created_at
    ) order by a.created_at desc), '[]'::jsonb)
    into v_atts
    from public.company_record_attachments a
    where a.record_id = v_id;

    return v_row || jsonb_build_object('attachments', v_atts);
  end if;

  -- Fallback: developer template record (developer-only)
  if admin.is_developer(auth.uid()) then
    select jsonb_build_object(
      'record_id', t.id::text,
      'company_id', ''::text,
      'company_name', 'FarmVault'::text,
      'crop_id', t.crop_id,
      'crop_name', public.fv_crop_name(t.crop_id, null),
      'title', t.title,
      'content', t.content,
      'source_type', 'developer',
      'created_by', t.created_by::text,
      'developer_sender_id', auth.uid()::text,
      'created_at', t.created_at,
      'updated_at', t.updated_at,
      'attachments', '[]'::jsonb
    )
    into v_row
    from public.developer_crop_record_templates t
    where t.id = v_id;
  end if;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) DEVELOPER-SIDE RPCs
-- ---------------------------------------------------------------------------

create or replace function public.dev_list_crop_records(
  p_company_id text default null,
  p_crop_id text default null,
  p_source_type text default null,
  p_limit int default 20,
  p_offset int default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, admin
as $$
declare
  v_rows jsonb := '[]'::jsonb;
  v_total int := 0;
begin
  if not admin.is_developer(auth.uid()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  -- Total count across company notes + templates, with filters applied.
  select (
    (select count(*)::int
     from public.company_records r
     where r.visibility = 'visible'
       and (p_company_id is null or r.company_id = p_company_id)
       and (p_crop_id is null or r.crop_id = p_crop_id)
       and (p_source_type is null or r.source_type = p_source_type)
    )
    +
    (select count(*)::int
     from public.developer_crop_record_templates t
     where (p_crop_id is null or t.crop_id = p_crop_id)
       and (p_source_type is null or p_source_type = 'developer')
       and (p_company_id is null) -- templates are global, not company-specific
    )
  ) into v_total;

  select coalesce(jsonb_agg(row_to_json(q)), '[]'::jsonb)
  into v_rows
  from (
    select *
    from (
      select
        r.id::text as record_id,
        r.company_id as company_id,
        r.crop_id as crop_id,
        public.fv_crop_name(r.crop_id, r.crop_name) as crop_name,
        r.title as title,
        left(coalesce(r.content,''), 220) as content_preview,
        (case when r.source_type = 'developer' then 'developer' else 'company' end)::text as source_type,
        r.created_by as created_by,
        r.developer_sender_id::text as developer_sender_id,
        r.created_at as created_at,
        r.updated_at as updated_at,
        (select count(*)::int from public.company_record_attachments a where a.record_id = r.id) as attachments_count,
        (select c2.name from core.companies c2 where c2.id::text = r.company_id) as company_name
      from public.company_records r
      where r.visibility = 'visible'
        and (p_company_id is null or r.company_id = p_company_id)
        and (p_crop_id is null or r.crop_id = p_crop_id)
        and (p_source_type is null or r.source_type = p_source_type)

      union all

      select
        t.id::text as record_id,
        '__farmvault__'::text as company_id,
        t.crop_id as crop_id,
        public.fv_crop_name(t.crop_id, null) as crop_name,
        t.title as title,
        left(coalesce(t.content,''), 220) as content_preview,
        'developer'::text as source_type,
        t.created_by::text as created_by,
        auth.uid()::text as developer_sender_id,
        t.created_at as created_at,
        t.updated_at as updated_at,
        0::int as attachments_count,
        'FarmVault'::text as company_name
      from public.developer_crop_record_templates t
      where (p_crop_id is null or t.crop_id = p_crop_id)
        and (p_source_type is null or p_source_type = 'developer')
        and (p_company_id is null)
    ) all_rows
    order by coalesce(updated_at, created_at) desc nulls last
    limit greatest(p_limit, 0)
    offset greatest(p_offset, 0)
  ) q;

  return jsonb_build_object('rows', v_rows, 'total', v_total);
end;
$$;

create or replace function public.dev_create_crop_record_template(
  p_crop_id text,
  p_title text,
  p_content text
)
returns jsonb
language plpgsql
security definer
set search_path = public, admin
as $$
declare
  v_crop_id text := trim(coalesce(p_crop_id,''));
  v_title text := trim(coalesce(p_title,''));
  v_content text := trim(coalesce(p_content,''));
  v_id uuid;
begin
  if not admin.is_developer(auth.uid()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if v_crop_id = '' then
    raise exception 'crop_id is required';
  end if;
  if v_title = '' then
    raise exception 'title is required';
  end if;
  if v_content = '' then
    raise exception 'content is required';
  end if;

  insert into public.developer_crop_record_templates (crop_id, title, content, created_by)
  values (v_crop_id, v_title, v_content, auth.uid())
  returning id into v_id;

  return jsonb_build_object('record_id', v_id::text);
end;
$$;

create or replace function public.dev_send_crop_record_to_company(
  p_company_id text,
  p_crop_id text,
  p_title text,
  p_content text
)
returns jsonb
language plpgsql
security definer
set search_path = public, admin
as $$
declare
  v_company_id text := trim(coalesce(p_company_id,''));
  v_crop_id text := trim(coalesce(p_crop_id,''));
  v_title text := trim(coalesce(p_title,''));
  v_content text := trim(coalesce(p_content,''));
  v_id uuid;
begin
  if not admin.is_developer(auth.uid()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if v_company_id = '' then
    raise exception 'company_id is required';
  end if;
  if v_crop_id = '' then
    raise exception 'crop_id is required';
  end if;
  if v_title = '' then
    raise exception 'title is required';
  end if;
  if v_content = '' then
    raise exception 'content is required';
  end if;

  insert into public.company_records (
    company_id, crop_id, category, title, content, highlights, tags,
    created_by, source_type, source_label, developer_sender_id, visibility
  )
  values (
    v_company_id, v_crop_id, 'General', v_title, v_content, '{}'::text[], '{}'::text[],
    null, 'developer', 'FarmVault', auth.uid(), 'visible'
  )
  returning id into v_id;

  return jsonb_build_object('record_id', v_id::text);
end;
$$;

create or replace function public.dev_send_existing_record_to_companies(
  p_record_id text,
  p_company_ids text[],
  p_target_crop_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, admin
as $$
declare
  v_record_id uuid := nullif(trim(coalesce(p_record_id,'')),'')::uuid;
  v_title text;
  v_content text;
  v_crop_id text;
  v_sent int := 0;
  v_company_id text;
  v_target text := lower(trim(coalesce(p_target_crop_id,'')));
  v_crop text;
begin
  if not admin.is_developer(auth.uid()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if v_record_id is null then
    raise exception 'record_id is required';
  end if;
  if p_company_ids is null or array_length(p_company_ids,1) is null then
    raise exception 'company_ids is required';
  end if;

  -- Load source record from company_records OR templates.
  select r.title, r.content, r.crop_id
  into v_title, v_content, v_crop_id
  from public.company_records r
  where r.id = v_record_id
    and r.visibility = 'visible';

  if v_title is null then
    select t.title, t.content, t.crop_id
    into v_title, v_content, v_crop_id
    from public.developer_crop_record_templates t
    where t.id = v_record_id;
  end if;

  if v_title is null then
    raise exception 'source record not found';
  end if;

  if p_target_crop_id is not null and trim(p_target_crop_id) <> '' then
    if v_target <> 'all' then
      v_crop_id := trim(p_target_crop_id);
    end if;
  end if;

  foreach v_company_id in array p_company_ids loop
    v_company_id := trim(coalesce(v_company_id,''));
    if v_company_id = '' then
      continue;
    end if;

    if v_target = 'all' then
      -- Send a copy into every crop notebook card (global + custom) for this company.
      for v_crop in
        select lc.crop_id
        from public.list_company_record_crops(v_company_id) lc
      loop
        insert into public.company_records (
          company_id, crop_id, category, title, content, highlights, tags,
          created_by, source_type, source_label, developer_sender_id, visibility
        )
        values (
          v_company_id, v_crop, 'General', v_title, v_content, '{}'::text[], '{}'::text[],
          null, 'developer', 'FarmVault', auth.uid(), 'visible'
        );
        v_sent := v_sent + 1;
      end loop;
    else
      insert into public.company_records (
        company_id, crop_id, category, title, content, highlights, tags,
        created_by, source_type, source_label, developer_sender_id, visibility
      )
      values (
        v_company_id, v_crop_id, 'General', v_title, v_content, '{}'::text[], '{}'::text[],
        null, 'developer', 'FarmVault', auth.uid(), 'visible'
      );
      v_sent := v_sent + 1;
    end if;
  end loop;

  return jsonb_build_object('sent', v_sent);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6) CROP INTELLIGENCE RPCs
-- ---------------------------------------------------------------------------

create or replace function public.get_crop_record_insights(p_crop_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, admin
as $$
declare
  v_crop_id text := trim(coalesce(p_crop_id,''));
  v_summary jsonb := '{}'::jsonb;
  v_recent jsonb := '[]'::jsonb;
begin
  if v_crop_id = '' then
    return null;
  end if;

  if not admin.is_developer(auth.uid()) then
    return null;
  end if;

  select jsonb_build_object(
    'total_records', count(*)::int,
    'company_notes', count(*) filter (where r.source_type = 'company')::int,
    'developer_notes', count(*) filter (where r.source_type = 'developer')::int,
    'distinct_companies', count(distinct r.company_id)::int,
    'latest_record_at', max(coalesce(r.updated_at, r.created_at))
  )
  into v_summary
  from public.company_records r
  where r.crop_id = v_crop_id
    and r.visibility = 'visible';

  select coalesce(jsonb_agg(jsonb_build_object(
    'record_id', r.id::text,
    'company_id', r.company_id,
    'crop_id', r.crop_id,
    'title', r.title,
    'content_preview', left(coalesce(r.content,''), 220),
    'source_type', r.source_type,
    'created_at', r.created_at
  ) order by r.created_at desc), '[]'::jsonb)
  into v_recent
  from (
    select *
    from public.company_records
    where crop_id = v_crop_id
      and visibility = 'visible'
    order by created_at desc
    limit 12
  ) r;

  return jsonb_build_object(
    'summary', v_summary,
    'recent_notes', v_recent
  );
end;
$$;

create or replace function public.get_crop_intelligence(p_crop_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, admin
as $$
declare
  v_crop_id text := trim(coalesce(p_crop_id,''));
  v_crop jsonb;
  v_profile jsonb;
  v_challenges jsonb;
  v_practices jsonb;
  v_chemicals jsonb;
  v_timing jsonb;
  v_summary jsonb;
begin
  if v_crop_id = '' then
    return null;
  end if;

  if not admin.is_developer(auth.uid()) then
    -- Company users can still view intelligence if present; allow signed-in.
    if auth.uid() is null then
      raise exception 'not authorized' using errcode = '42501';
    end if;
  end if;

  v_crop := jsonb_build_object(
    'crop_id', v_crop_id,
    'crop_name', public.fv_crop_name(v_crop_id, null),
    'slug', v_crop_id,
    'is_global', not v_crop_id like 'custom:%'
  );

  select to_jsonb(p) into v_profile
  from public.crop_knowledge_profiles p
  where p.crop_id = v_crop_id;
  if v_profile is null then
    v_profile := '{}'::jsonb;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id::text,
    'challenge_name', c.challenge_name,
    'challenge_type', c.challenge_type,
    'severity', c.severity,
    'notes', c.notes
  ) order by c.created_at desc), '[]'::jsonb)
  into v_challenges
  from public.crop_knowledge_challenges c
  where c.crop_id = v_crop_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id::text,
    'title', p.title,
    'practice_type', p.practice_type,
    'notes', p.notes
  ) order by p.created_at desc), '[]'::jsonb)
  into v_practices
  from public.crop_knowledge_practices p
  where p.crop_id = v_crop_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', ch.id::text,
    'chemical_name', ch.chemical_name,
    'purpose', ch.purpose,
    'dosage', ch.dosage,
    'stage_notes', ch.stage_notes,
    'phi_notes', ch.phi_notes,
    'mix_notes', ch.mix_notes
  ) order by ch.created_at desc), '[]'::jsonb)
  into v_chemicals
  from public.crop_knowledge_chemicals ch
  where ch.crop_id = v_crop_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', tw.id::text,
    'title', tw.title,
    'planting_start', tw.planting_start,
    'planting_end', tw.planting_end,
    'harvest_start', tw.harvest_start,
    'harvest_end', tw.harvest_end,
    'duration_notes', tw.duration_notes,
    'notes', tw.notes
  ) order by tw.created_at desc), '[]'::jsonb)
  into v_timing
  from public.crop_knowledge_timing_windows tw
  where tw.crop_id = v_crop_id;

  select jsonb_build_object(
    'records_count', count(*)::int,
    'company_notes_count', count(*) filter (where r.source_type = 'company')::int,
    'developer_notes_count', count(*) filter (where r.source_type = 'developer')::int,
    'latest_record_at', max(coalesce(r.updated_at, r.created_at))
  )
  into v_summary
  from public.company_records r
  where r.crop_id = v_crop_id
    and r.visibility = 'visible';

  return jsonb_build_object(
    'crop', v_crop,
    'profile', v_profile,
    'challenges', v_challenges,
    'practices', v_practices,
    'chemicals', v_chemicals,
    'timing_windows', v_timing,
    'record_summary', v_summary
  );
end;
$$;

create or replace function public.upsert_crop_knowledge_profile(
  p_crop_id text,
  p_maturity_min_days int default null,
  p_maturity_max_days int default null,
  p_best_timing_notes text default null,
  p_harvest_window_notes text default null,
  p_seasonal_notes text default null,
  p_fertilizer_notes text default null,
  p_market_notes text default null,
  p_irrigation_notes text default null,
  p_general_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public, admin
as $$
declare
  v_crop_id text := trim(coalesce(p_crop_id,''));
begin
  if not admin.is_developer(auth.uid()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if v_crop_id = '' then
    raise exception 'crop_id is required';
  end if;

  insert into public.crop_knowledge_profiles (
    crop_id, maturity_min_days, maturity_max_days, best_timing_notes, harvest_window_notes,
    seasonal_notes, fertilizer_notes, market_notes, irrigation_notes, general_notes, updated_at
  )
  values (
    v_crop_id, p_maturity_min_days, p_maturity_max_days, p_best_timing_notes, p_harvest_window_notes,
    p_seasonal_notes, p_fertilizer_notes, p_market_notes, p_irrigation_notes, p_general_notes, now()
  )
  on conflict (crop_id) do update set
    maturity_min_days = excluded.maturity_min_days,
    maturity_max_days = excluded.maturity_max_days,
    best_timing_notes = excluded.best_timing_notes,
    harvest_window_notes = excluded.harvest_window_notes,
    seasonal_notes = excluded.seasonal_notes,
    fertilizer_notes = excluded.fertilizer_notes,
    market_notes = excluded.market_notes,
    irrigation_notes = excluded.irrigation_notes,
    general_notes = excluded.general_notes,
    updated_at = now();
end;
$$;

create or replace function public.add_crop_knowledge_challenge(
  p_crop_id text,
  p_challenge_name text,
  p_challenge_type text,
  p_severity text default null,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public, admin
as $$
begin
  if not admin.is_developer(auth.uid()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  insert into public.crop_knowledge_challenges (crop_id, challenge_name, challenge_type, severity, notes)
  values (trim(coalesce(p_crop_id,'')), trim(coalesce(p_challenge_name,'')), trim(coalesce(p_challenge_type,'')), nullif(trim(p_severity),''), nullif(trim(p_notes),''));
end;
$$;

create or replace function public.add_crop_knowledge_practice(
  p_crop_id text,
  p_title text,
  p_practice_type text,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public, admin
as $$
begin
  if not admin.is_developer(auth.uid()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  insert into public.crop_knowledge_practices (crop_id, title, practice_type, notes)
  values (trim(coalesce(p_crop_id,'')), trim(coalesce(p_title,'')), trim(coalesce(p_practice_type,'')), nullif(trim(p_notes),''));
end;
$$;

create or replace function public.add_crop_knowledge_chemical(
  p_crop_id text,
  p_chemical_name text,
  p_purpose text default null,
  p_dosage text default null,
  p_stage_notes text default null,
  p_phi_notes text default null,
  p_mix_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public, admin
as $$
begin
  if not admin.is_developer(auth.uid()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  insert into public.crop_knowledge_chemicals (crop_id, chemical_name, purpose, dosage, stage_notes, phi_notes, mix_notes)
  values (
    trim(coalesce(p_crop_id,'')),
    trim(coalesce(p_chemical_name,'')),
    nullif(trim(p_purpose),''),
    nullif(trim(p_dosage),''),
    nullif(trim(p_stage_notes),''),
    nullif(trim(p_phi_notes),''),
    nullif(trim(p_mix_notes),'')
  );
end;
$$;

create or replace function public.add_crop_knowledge_timing_window(
  p_crop_id text,
  p_title text,
  p_planting_start text default null,
  p_planting_end text default null,
  p_harvest_start text default null,
  p_harvest_end text default null,
  p_duration_notes text default null,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public, admin
as $$
begin
  if not admin.is_developer(auth.uid()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  insert into public.crop_knowledge_timing_windows (
    crop_id, title, planting_start, planting_end, harvest_start, harvest_end, duration_notes, notes
  )
  values (
    trim(coalesce(p_crop_id,'')),
    trim(coalesce(p_title,'')),
    nullif(trim(p_planting_start),''),
    nullif(trim(p_planting_end),''),
    nullif(trim(p_harvest_start),''),
    nullif(trim(p_harvest_end),''),
    nullif(trim(p_duration_notes),''),
    nullif(trim(p_notes),'')
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 7) GRANTS
-- ---------------------------------------------------------------------------

grant select on public.company_record_crops to authenticated;
grant select on public.company_record_attachments to authenticated;
grant select on public.developer_crop_record_templates to authenticated;

grant execute on function public.fv_slugify(text) to authenticated;

grant execute on function public.create_company_record_crop(text, text) to authenticated;
grant execute on function public.list_company_record_crops(text) to authenticated;
grant execute on function public.create_company_crop_record(text, text, text, text) to authenticated;
grant execute on function public.list_crop_records(text, text, int, int) to authenticated;
grant execute on function public.get_crop_record_detail(text) to authenticated;
grant execute on function public.update_crop_record(text, text, text) to authenticated;
grant execute on function public.add_crop_record_attachment(text, text, text, text) to authenticated;

grant execute on function public.dev_list_crop_records(text, text, text, int, int) to authenticated;
grant execute on function public.dev_create_crop_record_template(text, text, text) to authenticated;
grant execute on function public.dev_send_crop_record_to_company(text, text, text, text) to authenticated;
grant execute on function public.dev_send_existing_record_to_companies(text, text[], text) to authenticated;

grant execute on function public.get_crop_intelligence(text) to authenticated;
grant execute on function public.get_crop_record_insights(text) to authenticated;
grant execute on function public.upsert_crop_knowledge_profile(text, int, int, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.add_crop_knowledge_challenge(text, text, text, text, text) to authenticated;
grant execute on function public.add_crop_knowledge_practice(text, text, text, text) to authenticated;
grant execute on function public.add_crop_knowledge_chemical(text, text, text, text, text, text, text) to authenticated;
grant execute on function public.add_crop_knowledge_timing_window(text, text, text, text, text, text, text, text) to authenticated;

commit;

notify pgrst, 'reload schema';

