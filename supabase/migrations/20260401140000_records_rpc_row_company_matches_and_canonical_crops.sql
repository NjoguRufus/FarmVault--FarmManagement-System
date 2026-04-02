-- Records: fix company RPC tenant checks + always expose canonical global notebook crops.
--
-- 1) Replace strict text equality (v_company_id = current_company_id()::text) with
--    public.row_company_matches_user(v_company_id), which normalizes UUID vs text
--    (e.g. uppercase vs lowercase UUID strings) and matches RLS used elsewhere.
-- 2) Merge a fixed catalog of global crops so new companies see notebook cards even
--    before any templates/records/intelligence rows exist.

begin;

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
  if not (public.is_developer() or public.row_company_matches_user(v_company_id)) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  v_slug := public.fv_slugify(v_name);
  if v_slug = '' then
    raise exception 'invalid crop name';
  end if;

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
  if not (public.is_developer() or public.row_company_matches_user(v_company_id)) then
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
  if not (public.is_developer() or public.row_company_matches_user(v_company_id)) then
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

commit;
