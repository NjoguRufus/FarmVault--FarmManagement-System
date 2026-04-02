-- Harden rpc_farmvault_notebook_list_crops against empty/uuid coercion; add farm notebook admin broadcasts.

begin;

-- ---------------------------------------------------------------------------
-- 1) Notebook crop list RPC: TEXT only (no DEFAULT — avoids PostgREST uuid coercion on "").
--    Session company fallback runs when p_company_id is null/blank after trim (never send "" from the client).
--    See 20260402200000 to drop stale uuid overloads on existing databases.
-- ---------------------------------------------------------------------------
drop function if exists public.rpc_farmvault_notebook_list_crops(text) cascade;

create function public.rpc_farmvault_notebook_list_crops(p_company_id text)
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
  v_company_id text;
  v_sess uuid;
begin
  v_company_id := nullif(trim(coalesce(p_company_id, '')), '');
  if v_company_id is null then
    begin
      v_sess := public.current_company_id();
      if v_sess is not null then
        v_company_id := nullif(trim(v_sess::text), '');
      end if;
    exception
      when others then
        v_company_id := null;
    end;
  end if;

  if v_company_id is null or v_company_id = '' then
    return;
  end if;

  if not (public.is_developer() or public.row_company_matches_user(v_company_id)) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return query
  with canonical_notebook_crops as (
    select * from (values
      ('tomatoes', 'Tomatoes'),
      ('french-beans', 'French Beans'),
      ('capsicum', 'Capsicum'),
      ('watermelon', 'Watermelon'),
      ('maize', 'Maize')
    ) as cn(crop_id, crop_name)
  ),
  global_crops as (
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
      cn.crop_id,
      cn.crop_name,
      cn.crop_id as slug,
      true as is_global
    from canonical_notebook_crops cn
    union all
    select
      gc.crop_id,
      coalesce(
        gc.crop_name,
        initcap(replace(replace(gc.crop_id, '_', ' '), '-', ' '))
      ) as crop_name,
      gc.slug,
      gc.is_global
    from global_crops gc
    where not exists (
      select 1 from canonical_notebook_crops cn2 where cn2.crop_id = gc.crop_id
    )
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
begin
  return query
  select *
  from public.rpc_farmvault_notebook_list_crops(p_company_id);
end;
$$;

revoke all on function public.list_company_record_crops(text) from public;
grant execute on function public.list_company_record_crops(text) to service_role;

revoke all on function public.rpc_farmvault_notebook_list_crops(text) from public;
grant execute on function public.rpc_farmvault_notebook_list_crops(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) Admin → farmer notebook broadcasts (targeted)
-- ---------------------------------------------------------------------------
do $enum$
begin
  if not exists (
    select 1
    from pg_catalog.pg_type t
    join pg_catalog.pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'notebook_note_target_type'
  ) then
    create type public.notebook_note_target_type as enum ('ALL', 'COMPANY', 'CROP', 'USER');
  end if;
end
$enum$;

create table if not exists public.farm_notebook_admin_notes (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  content text not null default '',
  crop_id text null,
  company_id text null,
  target_user_id text null,
  target_type public.notebook_note_target_type not null,
  created_by_admin boolean not null default true,
  created_by_user_id text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_farm_notebook_admin_notes_company_created
  on public.farm_notebook_admin_notes (company_id, created_at desc);

create index if not exists idx_farm_notebook_admin_notes_target_created
  on public.farm_notebook_admin_notes (target_type, created_at desc);

alter table public.farm_notebook_admin_notes enable row level security;

do $pub$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.farm_notebook_admin_notes;
    exception
      when duplicate_object then
        null;
    end;
  end if;
end
$pub$;

alter table public.farm_notebook_admin_notes replica identity full;

-- ---------------------------------------------------------------------------
-- 3) List visible admin notes for current member
-- ---------------------------------------------------------------------------
create or replace function public.rpc_list_farm_notebook_admin_notes(
  p_company_id text,
  p_crop_id text default null
)
returns table (
  id uuid,
  title text,
  content text,
  crop_id text,
  company_id text,
  target_user_id text,
  target_type text,
  created_by_admin boolean,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, core
as $$
declare
  v_company text;
  v_crop text;
  v_me text;
begin
  v_company := nullif(trim(coalesce(p_company_id, '')), '');
  v_crop := nullif(trim(coalesce(p_crop_id, '')), '');
  v_me := nullif(trim(coalesce(core.current_user_id(), '')), '');

  if v_company is null then
    return;
  end if;

  if not (public.is_developer() or public.row_company_matches_user(v_company)) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return query
  select
    n.id,
    n.title,
    n.content,
    n.crop_id,
    n.company_id,
    n.target_user_id,
    n.target_type::text,
    n.created_by_admin,
    n.created_at
  from public.farm_notebook_admin_notes n
  where
    n.target_type = 'ALL'::public.notebook_note_target_type
    or (
      n.target_type = 'COMPANY'::public.notebook_note_target_type
      and n.company_id is not null
      and trim(n.company_id) = v_company
    )
    or (
      n.target_type = 'CROP'::public.notebook_note_target_type
      and n.company_id is not null
      and trim(n.company_id) = v_company
      and (
        v_crop is null
        or n.crop_id is null
        or trim(n.crop_id) = v_crop
      )
    )
    or (
      n.target_type = 'USER'::public.notebook_note_target_type
      and n.company_id is not null
      and trim(n.company_id) = v_company
      and v_me is not null
      and n.target_user_id is not null
      and trim(n.target_user_id) = v_me
    )
  order by n.created_at desc;
end;
$$;

grant execute on function public.rpc_list_farm_notebook_admin_notes(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Developer sends a broadcast note
-- ---------------------------------------------------------------------------
create or replace function public.rpc_admin_send_farm_notebook_note(
  p_target_type text,
  p_title text,
  p_content text,
  p_company_id text default null,
  p_crop_id text default null,
  p_target_user_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, core
as $$
declare
  v_tid public.notebook_note_target_type;
  v_company text;
  v_crop text;
  v_user text;
  v_actor text;
  v_id uuid;
begin
  if not public.is_developer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  begin
    v_tid := trim(upper(coalesce(p_target_type, '')))::public.notebook_note_target_type;
  exception
    when others then
      raise exception 'invalid target_type' using errcode = 'P0001';
  end;

  v_actor := nullif(trim(coalesce(core.current_user_id(), '')), '');

  if v_tid = 'ALL'::public.notebook_note_target_type then
    insert into public.farm_notebook_admin_notes (
      title,
      content,
      crop_id,
      company_id,
      target_user_id,
      target_type,
      created_by_admin,
      created_by_user_id
    )
    values (
      coalesce(p_title, ''),
      coalesce(p_content, ''),
      null,
      null,
      null,
      v_tid,
      true,
      v_actor
    )
    returning id into v_id;
    return v_id;
  end if;

  v_company := nullif(trim(coalesce(p_company_id, '')), '');
  if v_company is null then
    raise exception 'company_id is required for this target' using errcode = 'P0001';
  end if;

  if v_tid = 'COMPANY'::public.notebook_note_target_type then
    insert into public.farm_notebook_admin_notes (
      title,
      content,
      crop_id,
      company_id,
      target_user_id,
      target_type,
      created_by_admin,
      created_by_user_id
    )
    values (
      coalesce(p_title, ''),
      coalesce(p_content, ''),
      null,
      v_company,
      null,
      v_tid,
      true,
      v_actor
    )
    returning id into v_id;
    return v_id;
  end if;

  if v_tid = 'CROP'::public.notebook_note_target_type then
    v_crop := nullif(trim(coalesce(p_crop_id, '')), '');
    if v_crop is null then
      raise exception 'crop_id is required for CROP target' using errcode = 'P0001';
    end if;
    insert into public.farm_notebook_admin_notes (
      title,
      content,
      crop_id,
      company_id,
      target_user_id,
      target_type,
      created_by_admin,
      created_by_user_id
    )
    values (
      coalesce(p_title, ''),
      coalesce(p_content, ''),
      v_crop,
      v_company,
      null,
      v_tid,
      true,
      v_actor
    )
    returning id into v_id;
    return v_id;
  end if;

  -- USER
  v_user := nullif(trim(coalesce(p_target_user_id, '')), '');
  if v_user is null then
    raise exception 'target_user_id is required for USER target' using errcode = 'P0001';
  end if;

  insert into public.farm_notebook_admin_notes (
    title,
    content,
    crop_id,
    company_id,
    target_user_id,
    target_type,
    created_by_admin,
    created_by_user_id
  )
  values (
    coalesce(p_title, ''),
    coalesce(p_content, ''),
    null,
    v_company,
    v_user,
    v_tid,
    true,
    v_actor
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.rpc_admin_send_farm_notebook_note(text, text, text, text, text, text) to authenticated;

do $$
begin
  perform pg_notify('pgrst', 'reload schema');
end $$;

commit;
