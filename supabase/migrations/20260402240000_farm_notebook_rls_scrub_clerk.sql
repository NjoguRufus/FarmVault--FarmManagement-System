-- Farm notebook still hits 22P02 when ANY policy on scanned tables references auth.uid()
-- (duplicate legacy policies, or inserts/updates evaluated oddly). Scrub all policies on
-- notebook-adjacent tables and recreate Clerk-only rules. Also scope company_records in
-- rpc_farmvault_notebook_list_crops so non-developers do not full-scan all tenants.

begin;

-- ---------------------------------------------------------------------------
-- Session helper (idempotent)
-- ---------------------------------------------------------------------------
create or replace function public.fv_has_clerk_session()
returns boolean
language plpgsql
stable
security definer
set search_path = core, public
as $$
declare
  v text;
begin
  begin
    v := nullif(trim(coalesce(core.current_user_id(), '')), '');
  exception
    when others then
      v := null;
  end;
  return v is not null;
end;
$$;

revoke all on function public.fv_has_clerk_session() from public;
grant execute on function public.fv_has_clerk_session() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Drop every policy on these tables (removes duplicates + legacy auth.uid rules)
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'company_records',
        'company_record_attachments',
        'company_record_crops',
        'developer_crop_record_templates',
        'crop_knowledge_profiles',
        'crop_knowledge_challenges',
        'crop_knowledge_practices',
        'crop_knowledge_chemicals',
        'crop_knowledge_timing_windows'
      )
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- company_records
-- ---------------------------------------------------------------------------
create policy company_records_select on public.company_records
for select
using (public.is_developer() or public.row_company_matches_user(company_id));

create policy company_records_insert on public.company_records
for insert
with check (
  public.fv_has_clerk_session()
  and company_id = public.current_company_id()::text
  and source_type = 'company'
);

create policy company_records_update on public.company_records
for update
using (
  public.is_developer()
  or (
    company_id = public.current_company_id()::text
    and source_type = 'company'
    and coalesce(created_by::text, '') = coalesce(nullif(trim(core.current_user_id()), ''), '')
  )
)
with check (
  public.is_developer()
  or (
    company_id = public.current_company_id()::text
    and source_type = 'company'
    and coalesce(created_by::text, '') = coalesce(nullif(trim(core.current_user_id()), ''), '')
  )
);

create policy company_records_delete on public.company_records
for delete
using (
  public.is_developer()
  or (
    public.row_company_matches_user(company_id)
    and coalesce(created_by::text, '') = coalesce(nullif(trim(core.current_user_id()), ''), '')
  )
);

-- ---------------------------------------------------------------------------
-- company_record_attachments
-- ---------------------------------------------------------------------------
create policy company_record_attachments_select on public.company_record_attachments
for select
using (
  public.is_developer()
  or exists (
    select 1
    from public.company_records r
    where r.id = company_record_attachments.record_id
      and public.row_company_matches_user(r.company_id)
  )
);

create policy company_record_attachments_insert on public.company_record_attachments
for insert
with check (
  public.is_developer()
  or exists (
    select 1
    from public.company_records r
    where r.id = company_record_attachments.record_id
      and r.company_id = public.current_company_id()::text
      and r.source_type = 'company'
      and coalesce(r.created_by::text, '') = coalesce(nullif(trim(core.current_user_id()), ''), '')
  )
);

create policy company_record_attachments_delete on public.company_record_attachments
for delete
using (
  public.is_developer()
  or exists (
    select 1
    from public.company_records r
    where r.id = company_record_attachments.record_id
      and r.company_id = public.current_company_id()::text
      and r.source_type = 'company'
      and coalesce(r.created_by::text, '') = coalesce(nullif(trim(core.current_user_id()), ''), '')
  )
);

-- ---------------------------------------------------------------------------
-- company_record_crops
-- ---------------------------------------------------------------------------
create policy company_record_crops_select on public.company_record_crops
for select
using (public.is_developer() or public.row_company_matches_user(company_id));

create policy company_record_crops_insert on public.company_record_crops
for insert
with check (
  public.fv_has_clerk_session()
  and company_id = public.current_company_id()::text
);

create policy company_record_crops_update on public.company_record_crops
for update
using (public.is_developer() or public.row_company_matches_user(company_id))
with check (public.is_developer() or public.row_company_matches_user(company_id));

create policy company_record_crops_delete on public.company_record_crops
for delete
using (public.is_developer() or public.row_company_matches_user(company_id));

-- ---------------------------------------------------------------------------
-- developer_crop_record_templates (developer-only)
-- ---------------------------------------------------------------------------
create policy dev_templates_all_developer on public.developer_crop_record_templates
for all
to authenticated
using (public.is_developer())
with check (public.is_developer());

-- ---------------------------------------------------------------------------
-- crop intelligence read: any signed-in Clerk session; write: developer
-- ---------------------------------------------------------------------------
create policy crop_knowledge_profiles_select on public.crop_knowledge_profiles
for select
using (public.fv_has_clerk_session());

create policy crop_knowledge_profiles_write on public.crop_knowledge_profiles
for all
using (public.is_developer())
with check (public.is_developer());

create policy crop_knowledge_challenges_select on public.crop_knowledge_challenges
for select
using (public.fv_has_clerk_session());

create policy crop_knowledge_challenges_write on public.crop_knowledge_challenges
for all
using (public.is_developer())
with check (public.is_developer());

create policy crop_knowledge_practices_select on public.crop_knowledge_practices
for select
using (public.fv_has_clerk_session());

create policy crop_knowledge_practices_write on public.crop_knowledge_practices
for all
using (public.is_developer())
with check (public.is_developer());

create policy crop_knowledge_chemicals_select on public.crop_knowledge_chemicals
for select
using (public.fv_has_clerk_session());

create policy crop_knowledge_chemicals_write on public.crop_knowledge_chemicals
for all
using (public.is_developer())
with check (public.is_developer());

create policy crop_knowledge_timing_windows_select on public.crop_knowledge_timing_windows
for select
using (public.fv_has_clerk_session());

create policy crop_knowledge_timing_windows_write on public.crop_knowledge_timing_windows
for all
using (public.is_developer())
with check (public.is_developer());

-- ---------------------------------------------------------------------------
-- Notebook RPC: scope company_records branch (developers see all; others current company)
-- ---------------------------------------------------------------------------
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

revoke all on function public.rpc_farmvault_notebook_list_crops(text) from public;
grant execute on function public.rpc_farmvault_notebook_list_crops(text) to authenticated, service_role;

commit;

notify pgrst, 'reload schema';
