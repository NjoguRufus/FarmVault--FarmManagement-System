-- Records (developer): Clerk + Supabase third-party auth often leaves auth.uid() NULL.
-- Developer RPCs and RLS used admin.is_developer(auth.uid()), which always failed.
-- Use public.is_developer() (core.current_user_id() / admin.developers) instead.

begin;

-- ---------------------------------------------------------------------------
-- RLS: developer-only write paths on templates + crop knowledge
-- ---------------------------------------------------------------------------

drop policy if exists dev_templates_all_developer on public.developer_crop_record_templates;
create policy dev_templates_all_developer on public.developer_crop_record_templates
for all
to authenticated
using (public.is_developer())
with check (public.is_developer());

drop policy if exists crop_knowledge_profiles_write on public.crop_knowledge_profiles;
create policy crop_knowledge_profiles_write on public.crop_knowledge_profiles
for all using (public.is_developer()) with check (public.is_developer());

drop policy if exists crop_knowledge_challenges_write on public.crop_knowledge_challenges;
create policy crop_knowledge_challenges_write on public.crop_knowledge_challenges
for all using (public.is_developer()) with check (public.is_developer());

drop policy if exists crop_knowledge_practices_write on public.crop_knowledge_practices;
create policy crop_knowledge_practices_write on public.crop_knowledge_practices
for all using (public.is_developer()) with check (public.is_developer());

drop policy if exists crop_knowledge_chemicals_write on public.crop_knowledge_chemicals;
create policy crop_knowledge_chemicals_write on public.crop_knowledge_chemicals
for all using (public.is_developer()) with check (public.is_developer());

drop policy if exists crop_knowledge_timing_windows_write on public.crop_knowledge_timing_windows;
create policy crop_knowledge_timing_windows_write on public.crop_knowledge_timing_windows
for all using (public.is_developer()) with check (public.is_developer());

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

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

  if public.is_developer() then
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
      'developer_sender_id', coalesce(nullif(trim(core.current_user_id()),''), auth.uid()::text),
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
  if not public.is_developer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

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
       and (p_company_id is null)
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
        coalesce(nullif(trim(core.current_user_id()),''), auth.uid()::text) as developer_sender_id,
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
  v_created_by uuid;
begin
  if not public.is_developer() then
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

  v_created_by := auth.uid();
  if v_created_by is null then
    v_created_by := gen_random_uuid();
  end if;

  insert into public.developer_crop_record_templates (crop_id, title, content, created_by)
  values (v_crop_id, v_title, v_content, v_created_by)
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
  v_sender uuid;
begin
  if not public.is_developer() then
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

  v_sender := auth.uid();
  if v_sender is null then
    v_sender := gen_random_uuid();
  end if;

  insert into public.company_records (
    company_id, crop_id, category, title, content, highlights, tags,
    created_by, source_type, source_label, developer_sender_id, visibility
  )
  values (
    v_company_id, v_crop_id, 'General', v_title, v_content, '{}'::text[], '{}'::text[],
    null, 'developer', 'FarmVault', v_sender, 'visible'
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
  v_sender uuid;
begin
  if not public.is_developer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if v_record_id is null then
    raise exception 'record_id is required';
  end if;
  if p_company_ids is null or array_length(p_company_ids,1) is null then
    raise exception 'company_ids is required';
  end if;

  v_sender := auth.uid();
  if v_sender is null then
    v_sender := gen_random_uuid();
  end if;

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
          null, 'developer', 'FarmVault', v_sender, 'visible'
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
        null, 'developer', 'FarmVault', v_sender, 'visible'
      );
      v_sent := v_sent + 1;
    end if;
  end loop;

  return jsonb_build_object('sent', v_sent);
end;
$$;

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

  if not public.is_developer() then
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
set search_path = public, admin, core
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

  if not public.is_developer() then
    if core.current_user_id() is null and auth.uid() is null then
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
  if not public.is_developer() then
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
  if not public.is_developer() then
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
  if not public.is_developer() then
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
  if not public.is_developer() then
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
  if not public.is_developer() then
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

commit;
