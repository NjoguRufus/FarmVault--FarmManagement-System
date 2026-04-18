-- One round-trip for tomato harvest list: sessions + bucket totals + picker counts per project.
-- Speeds up Harvest & Sales → Tomato harvest list on higher-latency clients.

begin;

create index if not exists idx_tomato_harvest_picker_logs_company_session
  on harvest.tomato_harvest_picker_logs (company_id, harvest_session_id);

create index if not exists idx_tomato_harvest_pickers_company_session
  on harvest.tomato_harvest_pickers (company_id, harvest_session_id);

create or replace function harvest.tomato_harvest_sessions_summaries_for_project(
  p_company_id uuid,
  p_project_id uuid
)
returns table (
  id uuid,
  company_id uuid,
  project_id uuid,
  crop_id uuid,
  harvest_number integer,
  session_date date,
  packaging_type text,
  packaging_count integer,
  sale_mode text,
  price_per_container numeric,
  sale_units integer,
  total_revenue numeric,
  picker_rate_per_bucket numeric,
  status text,
  created_by text,
  created_at timestamptz,
  updated_at timestamptz,
  total_buckets bigint,
  picker_count bigint
)
language sql
stable
set search_path = harvest, public
as $$
  select
    s.id,
    s.company_id,
    s.project_id,
    s.crop_id,
    s.harvest_number,
    s.session_date,
    s.packaging_type,
    s.packaging_count,
    s.sale_mode,
    s.price_per_container,
    s.sale_units,
    s.total_revenue,
    s.picker_rate_per_bucket,
    s.status,
    s.created_by,
    s.created_at,
    s.updated_at,
    coalesce(b.total_buckets, 0)::bigint,
    coalesce(pc.picker_count, 0)::bigint
  from harvest.tomato_harvest_sessions s
  left join (
    select harvest_session_id, sum(units)::bigint as total_buckets
    from harvest.tomato_harvest_picker_logs
    where company_id = p_company_id
    group by harvest_session_id
  ) b on b.harvest_session_id = s.id
  left join (
    select harvest_session_id, count(*)::bigint as picker_count
    from harvest.tomato_harvest_pickers
    where company_id = p_company_id
    group by harvest_session_id
  ) pc on pc.harvest_session_id = s.id
  where s.company_id = p_company_id
    and s.project_id = p_project_id
  order by s.session_date desc, s.harvest_number desc;
$$;

grant execute on function harvest.tomato_harvest_sessions_summaries_for_project(uuid, uuid) to authenticated;
grant execute on function harvest.tomato_harvest_sessions_summaries_for_project(uuid, uuid) to service_role;

commit;
