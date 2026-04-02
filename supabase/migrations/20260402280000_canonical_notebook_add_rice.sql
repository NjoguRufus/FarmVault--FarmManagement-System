-- Add Rice to canonical notebook crops (company + developer lists).

begin;

create or replace function public.rpc_farmvault_notebook_list_crops(p_company_id text)
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
      ('maize', 'Maize'),
      ('rice', 'Rice')
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
        and (public.is_developer() or r.company_id = v_company_id)

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

create or replace function public.dev_list_all_notebook_crops()
returns table (crop_id text, crop_name text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_developer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return query
  with combined as (
    select
      trim(both from coalesce(cc.crop_id, '')) as cid,
      nullif(trim(both from coalesce(cc.crop_name, '')), '') as cname
    from public.company_record_crops cc
    union all
    select
      trim(both from coalesce(r.crop_id, '')),
      nullif(trim(both from coalesce(r.crop_name, '')), '')
    from public.company_records r
    where r.visibility = 'visible'
    union all
    select
      trim(both from coalesce(t.crop_id, '')),
      null::text
    from public.developer_crop_record_templates t
    union all
    select v.cid, v.cname
    from (
      values
        ('tomatoes', 'Tomatoes'::text),
        ('french-beans', 'French Beans'),
        ('capsicum', 'Capsicum'),
        ('watermelon', 'Watermelon'),
        ('maize', 'Maize'),
        ('rice', 'Rice')
    ) as v(cid, cname)
  ),
  agg as (
    select
      c.cid as crop_id,
      coalesce(
        max(c.cname) filter (where c.cname is not null and c.cname <> ''),
        public.fv_crop_name(c.cid, null)
      ) as crop_name
    from combined c
    where c.cid is not null and c.cid <> ''
    group by c.cid
  )
  select a.crop_id, a.crop_name
  from agg a
  order by a.crop_name asc nulls last, a.crop_id asc;
end;
$$;

revoke all on function public.rpc_farmvault_notebook_list_crops(text) from public;
grant execute on function public.rpc_farmvault_notebook_list_crops(text) to authenticated, service_role;

revoke all on function public.dev_list_all_notebook_crops() from public;
grant execute on function public.dev_list_all_notebook_crops() to authenticated, service_role;

commit;

notify pgrst, 'reload schema';
