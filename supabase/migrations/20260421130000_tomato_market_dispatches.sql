-- Tomato market dispatches + company custom markets (packaging & sales → market flow).

begin;

-- -----------------------------------------------------------------------------
-- 1) Tables
-- -----------------------------------------------------------------------------

create table if not exists harvest.tomato_custom_markets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  name text not null,
  location text null,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_tomato_custom_markets_company_name_lower
  on harvest.tomato_custom_markets (company_id, (lower(trim(name))));

create index if not exists idx_tomato_custom_markets_company
  on harvest.tomato_custom_markets (company_id, created_at desc);

create table if not exists harvest.tomato_market_dispatches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  harvest_session_id uuid not null references harvest.tomato_harvest_sessions(id) on delete cascade,
  market_name text not null,
  broker_employee_id uuid null references public.employees(id) on delete set null,
  containers_sent int not null default 0 check (containers_sent >= 0),
  price_per_container numeric null check (price_per_container is null or price_per_container >= 0),
  total_revenue numeric null check (total_revenue is null or total_revenue >= 0),
  status text not null default 'pending' check (status in ('pending', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (harvest_session_id)
);

create index if not exists idx_tomato_market_dispatches_company_session
  on harvest.tomato_market_dispatches (company_id, harvest_session_id);

create index if not exists idx_tomato_market_dispatches_company_market
  on harvest.tomato_market_dispatches (company_id, market_name);

-- -----------------------------------------------------------------------------
-- 2) updated_at
-- -----------------------------------------------------------------------------

create or replace function harvest.tomato_market_dispatches_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists tr_tomato_market_dispatches_updated_at on harvest.tomato_market_dispatches;
create trigger tr_tomato_market_dispatches_updated_at
  before update on harvest.tomato_market_dispatches
  for each row
  execute function harvest.tomato_market_dispatches_touch_updated_at();

-- -----------------------------------------------------------------------------
-- 3) Grants
-- -----------------------------------------------------------------------------

grant select, insert, update, delete on harvest.tomato_custom_markets to authenticated, service_role;
grant select, insert, update, delete on harvest.tomato_market_dispatches to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4) RLS
-- -----------------------------------------------------------------------------

alter table harvest.tomato_custom_markets enable row level security;
alter table harvest.tomato_market_dispatches enable row level security;

drop policy if exists tomato_custom_markets_select on harvest.tomato_custom_markets;
create policy tomato_custom_markets_select
  on harvest.tomato_custom_markets
  for select
  using (public.is_developer() or core.is_company_member(company_id));

drop policy if exists tomato_custom_markets_insert on harvest.tomato_custom_markets;
create policy tomato_custom_markets_insert
  on harvest.tomato_custom_markets
  for insert
  with check (core.is_company_member(company_id));

drop policy if exists tomato_custom_markets_delete on harvest.tomato_custom_markets;
create policy tomato_custom_markets_delete
  on harvest.tomato_custom_markets
  for delete
  using (public.is_developer() or core.is_company_member(company_id));

drop policy if exists tomato_market_dispatches_select on harvest.tomato_market_dispatches;
create policy tomato_market_dispatches_select
  on harvest.tomato_market_dispatches
  for select
  using (
    public.is_developer()
    or (
      core.is_company_member(company_id)
      and exists (
        select 1
        from harvest.tomato_harvest_sessions s
        join projects.projects p on p.id = s.project_id
        where s.id = tomato_market_dispatches.harvest_session_id
          and p.deleted_at is null
      )
    )
  );

drop policy if exists tomato_market_dispatches_insert on harvest.tomato_market_dispatches;
create policy tomato_market_dispatches_insert
  on harvest.tomato_market_dispatches
  for insert
  with check (
    core.is_company_member(company_id)
    and exists (
      select 1
      from harvest.tomato_harvest_sessions s
      join projects.projects p on p.id = s.project_id
      where s.id = tomato_market_dispatches.harvest_session_id
        and s.company_id = tomato_market_dispatches.company_id
        and p.deleted_at is null
    )
  );

drop policy if exists tomato_market_dispatches_update on harvest.tomato_market_dispatches;
create policy tomato_market_dispatches_update
  on harvest.tomato_market_dispatches
  for update
  using (public.is_developer() or core.is_company_member(company_id))
  with check (public.is_developer() or core.is_company_member(company_id));

drop policy if exists tomato_market_dispatches_delete on harvest.tomato_market_dispatches;
create policy tomato_market_dispatches_delete
  on harvest.tomato_market_dispatches
  for delete
  using (
    public.is_developer()
    or (
      core.is_company_member(company_id)
      and core.is_company_admin(company_id)
    )
  );

-- -----------------------------------------------------------------------------
-- 5) Realtime
-- -----------------------------------------------------------------------------

do $realtime$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'harvest'
        and tablename = 'tomato_market_dispatches'
    ) then
      execute 'alter publication supabase_realtime add table harvest.tomato_market_dispatches';
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'harvest'
        and tablename = 'tomato_custom_markets'
    ) then
      execute 'alter publication supabase_realtime add table harvest.tomato_custom_markets';
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'harvest'
        and tablename = 'tomato_harvest_sessions'
    ) then
      execute 'alter publication supabase_realtime add table harvest.tomato_harvest_sessions';
    end if;
  end if;
end
$realtime$;

-- -----------------------------------------------------------------------------
-- 6) Revenue helpers in aggregates (farm vs completed market dispatch)
-- -----------------------------------------------------------------------------

drop function if exists harvest.company_tomato_harvest_aggregate(uuid, uuid);

create function harvest.company_tomato_harvest_aggregate(
  p_company_id uuid,
  p_project_id uuid default null
)
returns table (
  total_revenue numeric,
  total_buckets bigint,
  total_crates bigint,
  picker_cost numeric,
  pending_market_dispatches bigint
)
language sql
stable
set search_path = harvest, public
as $$
  with base as (
    select
      s.id as sid,
      s.company_id,
      s.project_id,
      s.packaging_count,
      s.picker_rate_per_bucket,
      s.sale_mode,
      s.total_revenue as s_total_revenue,
      s.price_per_container as s_price,
      s.sale_units as s_units,
      coalesce(b.bucket_sum, 0)::bigint as bucket_sum,
      d.id as d_id,
      d.status as d_status,
      d.total_revenue as d_total_revenue,
      d.price_per_container as d_price,
      d.containers_sent as d_containers
    from harvest.tomato_harvest_sessions s
    left join (
      select harvest_session_id, sum(units)::bigint as bucket_sum
      from harvest.tomato_harvest_picker_logs
      where company_id = p_company_id
      group by harvest_session_id
    ) b on b.harvest_session_id = s.id
    left join harvest.tomato_market_dispatches d
      on d.harvest_session_id = s.id
      and d.company_id = s.company_id
    where s.company_id = p_company_id
      and (p_project_id is null or s.project_id = p_project_id)
  ),
  line as (
    select
      case
        when sale_mode = 'market' then
          case
            when d_status = 'completed' then
              coalesce(
                case when d_total_revenue is not null and d_total_revenue >= 0 then d_total_revenue::numeric end,
                case
                  when d_price is not null and coalesce(d_containers, 0) > 0
                  then (d_price * d_containers)::numeric
                end,
                0::numeric
              )
            when d_id is not null then 0::numeric
            else
              coalesce(
                case when s_total_revenue is not null and s_total_revenue >= 0 then s_total_revenue::numeric end,
                case
                  when s_price is not null and s_units is not null
                  then (s_price * s_units)::numeric
                end,
                0::numeric
              )
          end
        else
          coalesce(
            case when s_total_revenue is not null and s_total_revenue >= 0 then s_total_revenue::numeric end,
            case
              when s_price is not null and s_units is not null
              then (s_price * s_units)::numeric
            end,
            0::numeric
          )
      end as rev,
      bucket_sum,
      packaging_count::bigint as crates,
      (bucket_sum * picker_rate_per_bucket)::numeric as pcost
    from base
  )
  select
    coalesce(sum(rev), 0)::numeric as total_revenue,
    coalesce(sum(bucket_sum), 0)::bigint as total_buckets,
    coalesce(sum(crates), 0)::bigint as total_crates,
    coalesce(sum(pcost), 0)::numeric as picker_cost,
    (
      select count(*)::bigint
      from harvest.tomato_market_dispatches md
      join harvest.tomato_harvest_sessions ss on ss.id = md.harvest_session_id
      where md.company_id = p_company_id
        and md.status = 'pending'
        and (p_project_id is null or ss.project_id = p_project_id)
    ) as pending_market_dispatches
  from line;
$$;

grant execute on function harvest.company_tomato_harvest_aggregate(uuid, uuid) to authenticated;
grant execute on function harvest.company_tomato_harvest_aggregate(uuid, uuid) to service_role;

create or replace function harvest.company_tomato_monthly_revenue(
  p_company_id uuid
)
returns table (
  month date,
  revenue numeric
)
language sql
stable
set search_path = harvest, public
as $$
  with base as (
    select
      s.session_date,
      s.sale_mode,
      s.total_revenue as s_total_revenue,
      s.price_per_container as s_price,
      s.sale_units as s_units,
      d.id as d_id,
      d.status as d_status,
      d.total_revenue as d_total_revenue,
      d.price_per_container as d_price,
      d.containers_sent as d_containers
    from harvest.tomato_harvest_sessions s
    left join harvest.tomato_market_dispatches d
      on d.harvest_session_id = s.id
      and d.company_id = s.company_id
    where s.company_id = p_company_id
  ),
  line as (
    select
      date_trunc('month', session_date::timestamp)::date as m,
      case
        when sale_mode = 'market' then
          case
            when d_status = 'completed' then
              coalesce(
                case when d_total_revenue is not null and d_total_revenue >= 0 then d_total_revenue::numeric end,
                case
                  when d_price is not null and coalesce(d_containers, 0) > 0
                  then (d_price * d_containers)::numeric
                end,
                0::numeric
              )
            when d_id is not null then 0::numeric
            else
              coalesce(
                case when s_total_revenue is not null and s_total_revenue >= 0 then s_total_revenue::numeric end,
                case
                  when s_price is not null and s_units is not null
                  then (s_price * s_units)::numeric
                end,
                0::numeric
              )
          end
        else
          coalesce(
            case when s_total_revenue is not null and s_total_revenue >= 0 then s_total_revenue::numeric end,
            case
              when s_price is not null and s_units is not null
              then (s_price * s_units)::numeric
            end,
            0::numeric
          )
      end as rev
    from base
  )
  select m as month, coalesce(sum(rev), 0)::numeric as revenue
  from line
  group by m
  order by m;
$$;

-- Optional reports: revenue by market (completed dispatches only)
create or replace function harvest.tomato_market_revenue_by_market(p_company_id uuid)
returns table (
  market_name text,
  total_revenue numeric,
  completed_count bigint,
  pending_count bigint
)
language sql
stable
set search_path = harvest, public
as $$
  select
    md.market_name,
    coalesce(sum(
      case
        when md.status = 'completed' then
          coalesce(
            case when md.total_revenue is not null and md.total_revenue >= 0 then md.total_revenue::numeric end,
            case
              when md.price_per_container is not null and md.containers_sent > 0
              then (md.price_per_container * md.containers_sent)::numeric
            end,
            0::numeric
          )
        else 0::numeric
      end
    ), 0)::numeric as total_revenue,
    count(*) filter (where md.status = 'completed')::bigint as completed_count,
    count(*) filter (where md.status = 'pending')::bigint as pending_count
  from harvest.tomato_market_dispatches md
  where md.company_id = p_company_id
  group by md.market_name
  order by total_revenue desc nulls last, market_name;
$$;

grant execute on function harvest.tomato_market_revenue_by_market(uuid) to authenticated;
grant execute on function harvest.tomato_market_revenue_by_market(uuid) to service_role;

-- -----------------------------------------------------------------------------
-- 7) List summaries RPC — include dispatch columns for client
-- -----------------------------------------------------------------------------

drop function if exists harvest.tomato_harvest_sessions_summaries_for_project(uuid, uuid);

create function harvest.tomato_harvest_sessions_summaries_for_project(
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
  picker_count bigint,
  md_id uuid,
  md_status text,
  md_market_name text,
  md_broker_employee_id uuid,
  md_containers_sent integer,
  md_price_per_container numeric,
  md_total_revenue numeric
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
    coalesce(pc.picker_count, 0)::bigint,
    d.id,
    d.status,
    d.market_name,
    d.broker_employee_id,
    d.containers_sent,
    d.price_per_container,
    d.total_revenue
  from harvest.tomato_harvest_sessions s
  left join harvest.tomato_market_dispatches d
    on d.harvest_session_id = s.id
    and d.company_id = s.company_id
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
