-- Distinct notebook crops across all tenants (developer tools).
-- Sources: company_record_crops, visible company_records, developer templates, canonical slugs.

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
        ('maize', 'Maize')
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

revoke all on function public.dev_list_all_notebook_crops() from public;
grant execute on function public.dev_list_all_notebook_crops() to authenticated, service_role;
